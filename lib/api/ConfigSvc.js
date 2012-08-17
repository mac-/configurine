var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
	Server = require('mongodb').Server,
	ObjectID = require('mongodb').ObjectID,
	ReplSetServers = require('mongodb').ReplSetServers,
	configSchema = require('./ConfigSchema.json'),
	jsonSchemaValidate = require("json-schema");

module.exports = function ConfigSvc(options) {

	options = options || {};
	
	//validator should expose validate(object,objectSchema) and return an array of errors.
	var validator = options.jsonValidator || jsonSchemaValidate;

	if (!options.db) {
		console.warn('using default connection settings for mongodb');
	}
	options.db = options.db || {};
	
	var configCollection = null,
		historyCollection = null,
		isConnecting = false,
		callbacksInWaiting = [],
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		self = this,
		db,
		dbHostParts,
		dbName = 'configurine',
		dbHosts = options.db.hosts || ['127.0.0.1:27017'],
		dbUser = options.db.userName || '',
		dbPass = options.db.password || '';

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


	var getConfigCollection = function (callback) {
		if (!configCollection) {
			db.collection('config', function getConfigCollectionHandler(err, collection) {
				if(err) {
					callback(err);
					return;
				}
				collection.ensureIndex({name: 1, isActive: 1, isSensitive: 1}, {background:true, safe:true}, function(err, indexName) {
					configCollection = collection;
					callback(err || null, collection);
				});
			});
			return;
		}
		callback(null, configCollection);
	};

	var getHistoryCollection = function (callback) {
		if (!historyCollection) {
			db.collection('history', function getHistoryCollectionHandler(err, collection) {
				if(err) {
					callback(err);
					return;
				}
				//collection.ensureIndex({name: 1}, {background:true, safe:true}, function(err, indexName) {
					historyCollection = collection;
					callback(err || null, collection);
				//});
			});
			return;
		}
		callback(null, historyCollection);
	};

	this.connect = function(callback) {
		if (isConnecting) {
			callbacksInWaiting.push(callback);
		}
		else if (!db.serverConfig.isConnected()) {
			isConnecting = true;
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
			});
		} else {
			callback();
		}
	};
	
	// made public for unit testing
	this._cloneDocument = function(doc) {

		var clonedDoc = {};
		clonedDoc.name = doc.name;
		clonedDoc.value = doc.value;
		clonedDoc.tags = doc.tags;
		clonedDoc.isSensitive = doc.isSensitive;
		clonedDoc.isActive = doc.isActive;
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
			configCollection.find(selector).toArray(callback);
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
				callback(error);
				return;
			}
			configCollection.findOne({_id: id}, callback);
		});
	};

	// finds a collection of config entries by name
	this.findByName = function(name, callback) {
		if (!name || typeof(name) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigCollection(function(error, configCollection) {
			if (error) {
				callback(error);
				return;
			}
			configCollection.find({name: name}).toArray(callback);
		});
	};

	// finds a collection of config entries by one or more tags
	this.findByTags = function(tags, callback) {
		if (!tags || typeof(tags) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		tags = (tags.length) ? tags : [tags];
		getConfigCollection(function(error, configCollection) {
			if (error) {
				callback(error);
				return;
			}
			configCollection.find({tags:{$all:tags}}).toArray(callback);
		});
	};

	// finds a collection of config entries by name and one or more tags
	this.findByNameAndTags = function(name, tags, callback) {
		if (!name || typeof(name) !== 'string' || !tags || typeof(tags) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		tags = (tags.length) ? tags : [tags];
		getConfigCollection(function(error, configCollection) {
			if (error) {
				callback(error);
				return;
			}
			configCollection.find({name:name, tags:{$all:tags}}).toArray(callback);
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
				callback(error);
				return;
			}
			configDoc = self._cloneDocument(configDoc);
			configDoc.created = new Date();
			configDoc.modified = new Date();

			// TODO: validate tag types?
			var errors = validator.validate(configDoc, configSchema).errors;
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			configCollection.insert(configDoc, callback);
		});
	};

	this.update = function(id, configDoc, callback) {
		if (!id || typeof(id) !== 'string' || !configDoc || typeof(configDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		
		getConfigCollection(function(error, configCollection) {
			if (error) {
				callback(error);
				return;
			}
			configDoc = self._cloneDocument(configDoc);
			configDoc.modified = new Date();
			var errors = validator.validate(configDoc, configSchema).errors;

			// TODO: validate tag types?
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			//TODO: add an entry in the history collection for this doc
			configCollection.update({ _id: id }, { $set: configDoc }, { safe: true, multi: false }, callback);
		});
		
	};

	//TODO: have a method to mark document as deleted, so that we can recover if need be
	this.remove = function(id, callback) {
		if (!id || typeof(id) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigCollection(function(error, configCollection) {
			if (error) {
				callback(error);
				return;
			}
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			configCollection.remove({ _id: id }, { safe: true }, callback);
			
		});
	};
};



