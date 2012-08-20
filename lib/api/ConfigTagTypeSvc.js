var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
	Server = require('mongodb').Server,
	ObjectID = require('mongodb').ObjectID,
	ReplSetServers = require('mongodb').ReplSetServers,
	configTagSchema = require('./ConfigTagSchema.json'),
	jsonSchemaValidate = require("json-schema");

module.exports = function ConfigTagTypesSvc(options) {

	options = options || {};
	
	//validator should expose validate(object,objectSchema) and return an array of errors.
	var validator = options.jsonValidator || jsonSchemaValidate;

	if (!options.db) {
		console.warn('using default connection settings for mongodb');
	}
	options.db = options.db || {};
	
	var configTagsCollection = null,
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


	var getConfigTagsCollection = function (callback) {
		if (!configTagsCollection) {
			db.collection('configTagTypes', function getConfigTagsCollectionHandler(err, collection) {
				if(err) {
					callback(err);
					return;
				}
				collection.ensureIndex({name: 1}, {background: true, safe: true, unique: true}, function(err, indexName) {
					configTagsCollection = collection;
					callback(err || null, collection);
				});
			});
			return;
		}
		callback(null, configTagsCollection);
	};

	this.disconnect = function() {
		if (!db.serverConfig.isConnected()) {
			db.close();
		}
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
		clonedDoc.priority = doc.priority;

		return clonedDoc;
	};

	//findAll
	this.findAll = function(callback) {
		if (!callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigTagsCollection(function(error, configTagsCollection) {
			if (error) {
				callback(error);
				return;
			}
			configTagsCollection.find().toArray(callback);
		});
	};

	//findByName
	this.findByName = function(name, callback) {
		if (!name || typeof(name) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigTagsCollection(function(error, configTagsCollection) {
			if (error) {
				callback(error);
				return;
			}
			configTagsCollection.findOne({ name: name }, callback);
		});
	};

	this.insert = function(userTagDoc, callback) {
		if (!userTagDoc || typeof(userTagDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		if (userTagDoc.hasOwnProperty('_id')) {
			throw new Error('Unable to insert a document that already contains an _id property');
		}
		// TODO: handle userTagDoc as an array
		getConfigTagsCollection(function(error, configTagsCollection) {
			if (error) {
				callback(error);
				return;
			}
			userTagDoc = self._cloneDocument(userTagDoc);

			// TODO: validate priority
			var errors = validator.validate(userTagDoc, configTagSchema).errors;
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			configTagsCollection.insert(userTagDoc, callback);
		});
	};

	this.update = function(id, userTagDoc, callback) {
		if (!id || typeof(id) !== 'string' || !userTagDoc || typeof(userTagDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		
		getConfigTagsCollection(function(error, configTagsCollection) {
			if (error) {
				callback(error);
				return;
			}
			userTagDoc = self._cloneDocument(userTagDoc);

			// TODO: validate priority
			var errors = validator.validate(userTagDoc, configTagSchema).errors;

			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			configTagsCollection.update({ _id: id }, { $set: userTagDoc }, { safe: true, multi: false }, callback);
		});
		
	};

	//TODO: have a method to mark document as deleted, so that we can recover if need be
	this.remove = function(id, callback) {
		if (!id || typeof(id) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigTagsCollection(function(error, configTagsCollection) {
			if (error) {
				callback(error);
				return;
			}
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			configTagsCollection.remove({ _id: id }, { safe: true }, callback);
			
		});
	};
};



