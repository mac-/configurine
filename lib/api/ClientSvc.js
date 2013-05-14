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
		self = this,
		db,
		dbHostParts,
		dbName = 'configurine',
		dbHosts = options.db.hosts || ['127.0.0.1:27017'],
		dbUser = options.db.userName || '',
		dbPass = options.db.password || '',
		clientIndex = null;

	if (dbHosts.length === 1) {
		dbHostParts = dbHosts[0].split(':');
		if (dbHostParts.length < 2) {
			dbHostParts.push(27017);
		}
		db = options.db.instance || new Db(dbName, new Server(dbHostParts[0], parseInt(dbHostParts[1], 10), {auto_reconnect: true, safe: true, strict: true}, {}));
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
		db = options.db.instance || new Db(dbName, replSet);
	}


	var getClientsCollection = function (callback) {
		self.connect(function(err) {
			if (err) {
				return callback(err);
			}
			db.collection('clients', function getClientsCollectionHandler(err, collection) {
				if (err) {
					return callback(err);
				}
				// cache the index so we don't need to keep ensuring it
				if (!clientIndex) {
					collection.ensureIndex({name: 1}, {background:true, safe:true, unique: true}, function(err, indexName) {
						if (err) {
							return callback(err);
						}
						clientIndex = indexName;
						callback(err || null, collection);
					});
				}
				else {
					callback(null, collection);
				}
			});
		});
		
	};


	this.disconnect = function() {
		if (!db.serverConfig.isConnected()) {
			db.close();
		}
	};

	this.connect = function(callback) {

		if (db._state === 'connected') {
			return callback();
		}
		else if (db._state === 'disconnected') {
			db.open(function(err, db) {
				if(err) {
					callbacksInWaiting.forEach(function(cb) {
						cb(err);
					});
					callbacksInWaiting = [];
					callback(err);
					isConnecting = false;
					return;
				}
				if (dbUser) {
					db.authenticate(dbUser, dbPass, function(err, result) {
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
					callbacksInWaiting.forEach(function(cb) {
						cb(null);
					});
					callbacksInWaiting = [];
					callback(null);
					isConnecting = false;
				}
			});
		}
		else if (db._state === 'connecting') {
			callbacksInWaiting.push(callback);
		}
	};
	
	// made public for unit testing
	this._cloneDocument = function(doc) {

		var clonedDoc = {};
		clonedDoc.name = doc.name;
		clonedDoc.type = doc.type;
		clonedDoc.sharedKey = doc.sharedKey;
		clonedDoc.password = doc.password;
		clonedDoc.privateKey = doc.privateKey;
		clonedDoc.applications = doc.applications.slice(0);
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
			clientCollection.find(selector).toArray(callback);
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
			clientCollection.findOne({_id: id}, callback);
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
			clientCollection.findOne({name: name}, callback);
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
			
			clientCollection.insert(clientDoc, { safe: true }, function(error, newDocs) {
				if (error) {
					return callback(error);
				}
				return callback(error, newDocs[0]);
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

			clientCollection.findOne({ _id: id }, function(error, clientEntry) {
				if (error || !clientEntry) {
					return callback(error, clientEntry);
				}
				clientCollection.update({ _id: id }, clientDoc, { safe: true, multi: false }, callback);
				
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

			clientCollection.findOne({ _id: id }, function(error, clientEntry) {
				if (error || !clientEntry) {
					return callback(error, clientEntry);
				}
				clientCollection.remove({ _id: id }, { safe: true }, callback);
				
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
			clientCollection.remove({ }, { safe: true }, callback);
		});
	};
};



