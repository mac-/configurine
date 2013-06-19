var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
	Server = require('mongodb').Server,
	ObjectID = require('mongodb').ObjectID,
	ReplSetServers = require('mongodb').ReplSetServers,
	configSchema = require('./ConfigSchema.json'),
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
		db,
		dbHostParts,
		dbName = 'configurine',
		dbHosts = options.db.hosts || ['127.0.0.1:27017'],
		dbUser = options.db.userName || '',
		dbPass = options.db.password || '',
		configIndex = null;

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

	statsdClient = statsdClient.getChildClient('config-service');

	var getInstrumentedCallback = function(metric, callback) {
			var startTime = new Date();
			statsdClient.increment(metric);
			return function(err, result) {
				statsdClient.timing(metric, startTime);
				callback(err, result);
			};
		},
		getConfigCollection = function (callback) {
			self.connect(function(err) {
				if (err) {
					logger.error('Error connecting to DB', err);
					return callback(err);
				}
				var startTime = new Date();
				db.collection('config', function getConfigCollectionHandler(err, collection) {
					statsdClient.timing('db.get-collection', startTime);
					if (err) {
						statsdClient.increment('db.get-collection.failure');
						logger.error('Error getting collection', err);
						return callback(err);
					}
					statsdClient.increment('db.get-collection.success');
					// cache the index so we don't need to keep ensuring it
					if (!configIndex) {
						collection.ensureIndex({name: 1, 'associations.environments': 1}, {background:true, safe:true}, function(err, indexName) {
							if (err) {
								logger.error('Error ensuring index', err);
								return callback(err);
							}
							collection.ensureIndex({'associations.applications.name': 1, 'associations.applications.versions': 1}, {background:true, safe:true}, function(err, indexName) {
								if (err) {
									logger.error('Error ensuring index', err);
									return callback(err);
								}
								collection.ensureIndex({'associations.environments': 1}, {background:true, safe:true}, function(err, indexName) {
									if (err) {
										logger.error('Error ensuring index', err);
										return callback(err);
									}
									configIndex = indexName;
									callback(null, collection);
								});
							});
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
			statsdClient.increment('db.close-connection');
			db.close();
		}
	};

	this.connect = function(callback) {

		if (db._state === 'connected') {
			return callback();
		}
		else if (db._state === 'disconnected') {
			var startTime = new Date();
			db.open(function(err, db) {
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
		else if (db._state === 'connecting') {
			callbacksInWaiting.push(callback);
		}
	};
	
	// made public for unit testing
	this._cloneDocument = function(doc) {

		var clonedDoc = {};
		clonedDoc.name = doc.name;
		clonedDoc.value = doc.value;
		clonedDoc.associations = doc.associations;
		clonedDoc.isSensitive = doc.isSensitive;
		clonedDoc.isActive = doc.isActive;
		clonedDoc.owner = doc.owner;
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

		getConfigCollection(function(error, configCollection) {
			if (error) {
				callback(error);
				return;
			}
			configCollection.find(selector).toArray(getInstrumentedCallback('db.findAll', callback));
		});
	};

	//findById
	this.findById = function(id, callback) {
		if (!id || (typeof(id) !== 'string' && typeof(id) !== 'object') || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		id = (typeof(id) === 'string') ? new ObjectID(id) : id;
		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configCollection.findOne({_id: id}, getInstrumentedCallback('db.findById', callback));
		});
	};

	// finds a collection of config entries by name
	this.findByName = function(names, callback) {
		if (!names || (typeof(names) !== 'string' && typeof(names) !== 'object') || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		names = (names instanceof Array) ? names : [names];
		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configCollection.find({name: {"$in": names} }).toArray(getInstrumentedCallback('db.findByName', callback));
		});
	};

	// finds a collection of config entries by a single app association
	this.findByApplicationAssociation = function(appName, appVersion, callback) {
		if (!appName || typeof(appName) !== 'string' || !appVersion || typeof(appVersion) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configCollection.find({"associations.applications.name": appName, "associations.applications.versions": {"$in": [appVersion] } }).toArray(getInstrumentedCallback('db.findByApplicationAssociation', callback));
		});
	};

	// finds a collection of config entries by a single environment association
	this.findByEnvironmentAssociation = function(envName, callback) {
		if (!envName || typeof(envName) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configCollection.find({"associations.environments": { "$in": [envName]} }).toArray(getInstrumentedCallback('db.findByEnvironmentAssociation', callback));
		});
	};

	// finds a collection of config entries by name and one or more associations
	this.findByNameAndEnvironmentAssociation = function(names, envName, callback) {
		if (!names || (typeof(names) !== 'string' && typeof(names) !== 'object') || !envName || typeof(envName) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		names = (names instanceof Array) ? names : [names];
		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configCollection.find({name: {"$in": names}, "associations.environments": { "$in": [envName]} }).toArray(getInstrumentedCallback('db.findByNameAndEnvironmentAssociation', callback));
		});
	};

	this.insert = function(configDoc, callback) {
		if (!configDoc || typeof(configDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		if (configDoc.hasOwnProperty('_id')) {
			throw new Error('Unable to insert a document that already contains an _id property');
		}
		// TODO: handle configDoc as an array
		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configDoc = self._cloneDocument(configDoc);
			configDoc.created = new Date();
			configDoc.modified = new Date();

			var errors = validator.validate(configDoc, configSchema).errors;
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			var icb = getInstrumentedCallback('db.insert', callback);
			configCollection.insert(configDoc, { safe: true }, function(error, newDocs) {
				if (error) {
					return callback(error);
				}
				icb(error, newDocs[0]);
			});
		});
	};

	this.update = function(id, configDoc, callback) {
		if (!id || typeof(id) !== 'string' || !configDoc || typeof(configDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configDoc = self._cloneDocument(configDoc);
			configDoc.modified = new Date();
			
			var errors = validator.validate(configDoc, configSchema).errors;
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			var icb = getInstrumentedCallback('db.update', callback);
			configCollection.findOne({ _id: id }, function(error, configEntry) {
				if (error || !configEntry) {
					return callback(error, configEntry);
				}
				configCollection.update({ _id: id }, configDoc, { safe: true, multi: false }, icb);
				
			});
		});
		
	};



	this.remove = function(id, callback) {
		if (!id || typeof(id) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			var icb = getInstrumentedCallback('db.remove', callback);
			configCollection.findOne({ _id: id }, function(error, configEntry) {
				if (error || !configEntry) {
					return callback(error, configEntry);
				}
				configCollection.remove({ _id: id }, { safe: true }, icb);
				
			});
		});
	};

	this.removeAll = function(callback) {
		if (!callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigCollection(function(error, configCollection) {
			if (error) {
				return callback(error);
			}
			configCollection.remove({ }, { safe: true }, getInstrumentedCallback('db.removeAll', callback));
		});
	};
};



