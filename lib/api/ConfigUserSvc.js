var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
	Server = require('mongodb').Server,
	ObjectID = require('mongodb').ObjectID,
	ReplSetServers = require('mongodb').ReplSetServers,
	configUserSchema = require('./ConfigUserSchema.json'),
	jsonSchemaValidate = require("json-schema");

module.exports = function ConfigUserSvc(options) {

	options = options || {};
	
	//validator should expose validate(object,objectSchema) and return an array of errors.
	var validator = options.jsonValidator || jsonSchemaValidate;

	if (!options.db) {
		console.warn('using default connection settings for mongodb');
	}
	options.db = options.db || {};
	
	var configUsersCollection = null,
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
	

	var getConfigUsersCollection = function (callback) {
		if (!configUsersCollection) {
			db.collection('configUsers', function getConfigUsersCollectionHandler(err, collection) {
				if(err) {
					callback(err);
					return;
				}
				collection.ensureIndex({name: 1}, {background: true, safe: true, unique: true}, function(err, indexName) {
					configUsersCollection = collection;
					callback(err || null, collection);
				});
			});
			return;
		}
		callback(null, configUsersCollection);
	};

	this.PERMISSIONS_READ_ONLY = Math.pow(2,0);
	this.PERMISSIONS_READ_WRITE = Math.pow(2,1);
	this.PERMISSIONS_ADMIN = Math.pow(2,2);

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
			configUsersCollection = null;
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
		}
		else if (db._state === 'connecting') {
			callbacksInWaiting.push(callback);
		}
	};
	
	// made public for unit testing
	this._cloneDocument = function(doc) {

		var clonedDoc = {};
		clonedDoc.name = doc.name;
		clonedDoc.password = doc.password;
		clonedDoc.permissions = doc.permissions;
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

		getConfigUsersCollection(function(error, configUsersCollection) {
			if (error) {
				callback(error);
				return;
			}
			configUsersCollection.find(selector).toArray(callback);
		});
	};

	//findById
	this.findById = function(id, callback) {
		if (!id || (typeof(id) !== 'string' && typeof(id) !== 'object') || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		id = (typeof(id) === 'string') ? new ObjectID(id) : id;
		getConfigUsersCollection(function(error, configUsersCollection) {
			if (error) {
				callback(error);
				return;
			}
			configUsersCollection.findOne({_id: id}, callback);
		});
	};

	// finds a collection of config users by name
	this.findByName = function(name, callback) {
		if (!name || typeof(name) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigUsersCollection(function(error, configUsersCollection) {
			if (error) {
				callback(error);
				return;
			}
			configUsersCollection.findOne({name: name}, callback);
		});
	};

	this.insert = function(userDoc, callback) {
		if (!userDoc || typeof(userDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		if (userDoc.hasOwnProperty('_id')) {
			throw new Error('Unable to insert a document that already contains an _id property');
		}
		// TODO: handle userDoc as an array
		getConfigUsersCollection(function(error, configUsersCollection) {
			if (error) {
				callback(error);
				return;
			}
			userDoc = self._cloneDocument(userDoc);
			userDoc.created = new Date();
			userDoc.modified = new Date();
			// if no permissions are specified, let's default to read-only
			userDoc.permissions = userDoc.permissions || self.PERMISSIONS_READ_ONLY;

			var errors = validator.validate(userDoc, configUserSchema).errors;
			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			configUsersCollection.insert(userDoc, callback);
		});
	};

	this.update = function(id, userDoc, callback) {
		if (!id || typeof(id) !== 'string' || !userDoc || typeof(userDoc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		
		getConfigUsersCollection(function(error, configUsersCollection) {
			if (error) {
				callback(error);
				return;
			}
			userDoc = self._cloneDocument(userDoc);
			userDoc.modified = new Date();
			var errors = validator.validate(userDoc, configUserSchema).errors;

			if (errors.length > 0) {
				callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(errors)));
				return;
			}
			
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			configUsersCollection.update({ _id: id }, { $set: userDoc }, { safe: true, multi: false }, callback);
		});
		
	};

	this.remove = function(id, callback) {
		if (!id || typeof(id) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		getConfigUsersCollection(function(error, configUsersCollection) {
			if (error) {
				callback(error);
				return;
			}
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			configUsersCollection.remove({ _id: id }, { safe: true }, callback);
			
		});
	};
};



