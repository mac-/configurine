var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
	Server = require('mongodb').Server,
	ObjectID = require('mongodb').ObjectID,
	ReplSetServers = require('mongodb').ReplSetServers,
	clientSchema = require('./ClientSchema.json'),
	jsonSchemaValidate = require('json-schema');

module.exports = function ConfigSvc(options) {

	options = options || {};
	
	//validator should expose validate(object,objectSchema) and return an array of errors.
	var validator = options.jsonValidator || jsonSchemaValidate;

	if (!options.db) {
		console.warn('using default connection settings for mongodb');
	}
	options.db = options.db || {};
	
	var isConnecting = false,
		callbacksInWaiting = [],
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		statsdClient = options.statsdClient || {increment:function(){},decrement:function(){},counter:function(){},guage:function(){},timing:function(){},getChildClient:function(){return this;}},
		self = this,
		dbHostParts,
		dbName = 'configurine',
		dbHosts = options.db.hosts || ['127.0.0.1:27017'],
		dbUser = options.db.userName || '',
		dbPass = options.db.password || '',
		clientIndex = null;

	this._db = null;

	if (dbHosts.length === 1) {
		dbHostParts = dbHosts[0].split(':');
		if (dbHostParts.length < 2) {
			dbHostParts.push(27017);
		}
		this._db = options.db.instance || new Db(dbName, new Server(dbHostParts[0], parseInt(dbHostParts[1], 10), {auto_reconnect: true, safe: true, strict: true}, {}));
	}
	else {
		var servers = [];
		for(var i =0; i< dbHosts.length; i++) {
			dbHostParts = dbHosts[i].split(':');
			if (dbHostParts.length < 2) {
				dbHostParts.push(27017);
			}
			servers.push(new Server(dbHostParts[0], parseInt(dbHostParts[1], 10), { auto_reconnect: true, safe: true, strict: true} ));
		}
		var replSet = new ReplSetServers(servers);
		this._db = options.db.instance || new Db(dbName, replSet);
	}

	statsdClient = statsdClient.getChildClient('client-service');


	var getInstrumentedCallback = function(metric, callback) {
			var startTime = new Date();
			statsdClient.increment(metric);
			return function(err, result) {
				statsdClient.timing(metric, startTime);
				callback(err, result);
			};
		},
		getClientsCollection = function (callback) {
			self.connect(function(err) {
				if (err) {
					logger.error('Error connecting to DB', err);
					return callback(err);
				}
				var startTime = new Date();
				self._db.collection('clients', function getClientsCollectionHandler(err, collection) {
					statsdClient.timing('db.get-collection', startTime);
					if (err) {
						statsdClient.increment('db.get-collection.failure');
						logger.error('Error getting collection', err);
						return callback(err);
					}
					statsdClient.increment('db.get-collection.success');
					// cache the index so we don't need to keep ensuring it
					if (!clientIndex) {
						collection.ensureIndex({name: 1}, {background:true, safe:true, unique: true}, function(err, indexName) {
							if (err) {
								logger.error('Error ensuring index', err);
								return callback(err);
							}
							clientIndex = indexName;
							callback(null, collection);
						});
					}
					else {
						callback(null, collection);
					}
				});
			});
			
		};


	this.disconnect = function() {
		if (this._db.serverConfig.isConnected()) {
			statsdClient.increment('db.close-connection');
			this._db.close();
		}
	};

	this.connect = function(callback) {

		if (this._db._state === 'connected') {
			return callback();
		}
		else if (this._db._state === 'disconnected') {
			var startTime = new Date();
			this._db.open(function(err, db) {
				statsdClient.timing('db.open-connection', startTime);
				if (err) {
					statsdClient.increment('db.open-connection.failure');
					callbacksInWaiting.forEach(function(cb) {
						cb(err);
					});
					callbacksInWaiting = [];
					callback(err);
					isConnecting = false;
					return;
				}
				statsdClient.increment('db.open-connection.success');
				if (dbUser) {
					logger.log('Authenticating to DB as user:', dbUser);
					self._db.authenticate(dbUser, dbPass, function(err, result) {
						if(err || !result) {
							callbacksInWaiting.forEach(function(cb) {
								cb(err);
							});
							callbacksInWaiting = [];
							callback(err);
							isConnecting = false;
							return;
						}

						callbacksInWaiting.forEach(function(cb) {
							cb(null);
						});
						callbacksInWaiting = [];
						callback(null);
						isConnecting = false;
						
					});
				}
				else {
					logger.log('No DB authentication being used');
					callbacksInWaiting.forEach(function(cb) {
						cb(null);
					});
					callbacksInWaiting = [];
					callback(null);
					isConnecting = false;
				}
			});
		}
		else if (this._db._state === 'connecting') {
			callbacksInWaiting.push(callback);
		}
	};
	
	// made public for unit testing
	this._cloneDocument = function(doc) {

		var clonedDoc = {};
		clonedDoc.name = doc.name;
		clonedDoc.sharedKey = doc.sharedKey;
		clonedDoc.email = doc.email;
		clonedDoc.isConfirmed = doc.isConfirmed;
		clonedDoc.isAdmin = doc.isAdmin;
		clonedDoc.privateKey = doc.privateKey;
		// don't clone created and modified props, those are controlled internally

		return clonedDoc;
	};

	//findAll, with optional selector
	this.findAll = function(selector, callback) {
		// if selector is a function, assume it's actually the callback
		if (selector && typeof(selector) === 'function') {
			callback = selector;
			selector = {};
		}
		else if (!callback || typeof(callback) !== 'function' || (selector && typeof(selector) !== 'object')) {
			throw new Error('Missing or invalid parameters');
		}
		// make sure selector isn't null/undefined
		selector = selector || {};

		getClientsCollection(function(error, clientCollection) {
			if (error) {
				callback(error);
				return;
			}
			clientCollection.find(selector).toArray(getInstrumentedCallback('db.findAll', callback));
		});
	};

	//findById
	this.findById = function(id, callback) {
		if (!id || (typeof(id) !== 'string' && typeof(id) !== 'object') || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		id = (typeof(id) === 'string') ? new ObjectID(id) : id;
		getClientsCollection(function(error, clientCollection) {
			if (error) {
				return callback(error);
			}
			clientCollection.findOne({_id: id}, getInstrumentedCallback('db.findById', callback));
		});
	};

	// finds a collection of client entries by name
	this.findByName = function(name, callback) {
		if (!name || (typeof(name) !== 'string' && typeof(name) !== 'object') || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getClientsCollection(function(error, clientCollection) {
			if (error) {
				return callback(error);
			}
			clientCollection.findOne({name: name}, getInstrumentedCallback('db.findByName', callback));
		});
	};

	this.insert = function(clientDoc, callback) {
		if (!clientDoc || typeof(clientDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		if (clientDoc.hasOwnProperty('_id')) {
			throw new Error('Unable to insert a document that already contains an _id property');
		}
		
		getClientsCollection(function(error, clientCollection) {
			if (error) {
				return callback(error);
			}
			clientDoc = self._cloneDocument(clientDoc);
			clientDoc.created = new Date();
			clientDoc.modified = new Date();

			var errors = validator.validate(clientDoc, clientSchema).errors;
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			var icb = getInstrumentedCallback('db.insert', callback);
			clientCollection.insert(clientDoc, { safe: true }, function(error, newDocs) {
				if (error) {
					return callback(error);
				}
				icb(error, newDocs[0]);
			});
		});
	};

	this.update = function(id, clientDoc, callback) {
		if (!id || typeof(id) !== 'string' || !clientDoc || typeof(clientDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		getClientsCollection(function(error, clientCollection) {
			if (error) {
				return callback(error);
			}
			clientDoc = self._cloneDocument(clientDoc);
			clientDoc.modified = new Date();
			
			var errors = validator.validate(clientDoc, clientSchema).errors;
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			var icb = getInstrumentedCallback('db.update', callback);
			clientCollection.findOne({ _id: id }, function(error, clientEntry) {
				if (error || !clientEntry) {
					return callback(error, clientEntry);
				}
				clientCollection.update({ _id: id }, clientDoc, { safe: true, multi: false }, icb);
				
			});
		});
		
	};



	this.remove = function(id, callback) {
		if (!id || typeof(id) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getClientsCollection(function(error, clientCollection) {
			if (error) {
				return callback(error);
			}
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			var icb = getInstrumentedCallback('db.remove', callback);
			clientCollection.findOne({ _id: id }, function(error, clientEntry) {
				if (error || !clientEntry) {
					return callback(error, clientEntry);
				}
				clientCollection.remove({ _id: id }, { safe: true }, icb);
				
			});
		});
	};

	this.removeAll = function(callback) {
		if (!callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getClientsCollection(function(error, clientCollection) {
			if (error) {
				return callback(error);
			}
			clientCollection.remove({ }, { safe: true }, getInstrumentedCallback('db.removeAll', callback));
		});
	};
};



