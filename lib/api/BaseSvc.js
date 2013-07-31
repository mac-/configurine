var Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	ObjectID = require('mongodb').ObjectID,
	ReplSetServers = require('mongodb').ReplSetServers,
	_ = require('underscore'),
	async = require('async'),
	clone = require('clone'),
	joi = require('joi');

module.exports = function BaseSvc(options) {

	options = options || {};
	options.db = options.db || {};
	
	var isConnecting = false,
		callbacksInWaiting = [],
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		statsdClient = options.statsdClient || {increment:function(){},decrement:function(){},counter:function(){},guage:function(){},timing:function(){},getChildClient:function(){return this;}},
		self = this,
		dbHostParts,
		dbName = options.db.name || 'test',
		dbHosts = options.db.hosts || ['127.0.0.1:27017'],
		dbUser = options.db.userName || '',
		dbPass = options.db.password || '',
		collectionName = options.db.collectionName || 'test',
		schema = options.db.schema || {},
		indeces = options.db.indeces,
		isIndexEnsured = false;

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

	statsdClient = statsdClient.getChildClient('db.' + dbName + '.' + collectionName);


	// protected props start with _
	this._getStatsdClient = function() {
		return statsdClient;
	};

	this._convertToObjectIds = function(ids) {
		if (_.isArray(ids)) {
			return _.map(ids, function(id) { return new ObjectID(id); });
		}
		return new ObjectID(ids);
	};

	this._getInstrumentedCallback = function(metric, cb) {
		var startTime = new Date();
		return function(err, result) {
			metric = (err) ? metric + '.error' : metric + '.success';
			statsdClient.increment(metric);
			statsdClient.timing(metric, startTime);
			cb(err, result);
		};
	};

	this._getCollection = function (callback) {
		self.connect(function(err) {
			if (err) {
				logger.error('Error connecting to DB', err);
				return callback(err);
			}
			
			var collection;
			try {
				collection = self._db.collection(collectionName);
			}
			catch (ex) {
				logger.error('Error getting collection', ex);
				return callback(ex);
			}

			if (indeces && !isIndexEnsured) {
				var ensureIndexFuncs = [];
				for (var i = 0; i < indeces.length; i++) {
					(function(idx) {
						var func = function(cb) {
							collection.ensureIndex(idx.index, {background: true, safe: true, unique: idx.unique}, cb);
						};
						ensureIndexFuncs.push(func);
					}(indeces[i]));
				}

				async.parallel(ensureIndexFuncs, function(err, results) {
					if (err) {
						logger.error('Error ensuring index', err);
						return callback(err);
					}
					isIndexEnsured = true;
					callback(null, collection);
				});
			}
			else {
				callback(null, collection);
			}
		});
		
	};

	this._cloneDocument = function(doc, schema) {

		var clonedDoc = {};
		for (var prop in schema) {
			if (schema.hasOwnProperty(prop) && prop !== '_id') {
				clonedDoc[prop] = clone(doc[prop]);
			}
		}
		return clonedDoc;
	};

	this.disconnect = function() {
		if (this._db.serverConfig.isConnected()) {
			statsdClient.increment('close-connection');
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
				statsdClient.timing('open-connection', startTime);
				if (err) {
					statsdClient.increment('open-connection.failure');
					callbacksInWaiting.forEach(function(cb) {
						cb(err);
					});
					callbacksInWaiting = [];
					callback(err);
					isConnecting = false;
					return;
				}
				statsdClient.increment('open-connection.success');
				if (dbUser) {
					logger.log('Authenticating to DB as user:', dbUser);
					self._db.authenticate(dbUser, dbPass, function(err, result) {
						if (err) {
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

		self._getCollection(function(error, collection) {
			if (error) {
				callback(error);
				return;
			}
			collection.find(selector).toArray(self._getInstrumentedCallback('findAll', callback));
		});
	};

	//findById
	this.findById = function(id, callback) {
		if (!id || (typeof(id) !== 'string' && typeof(id) !== 'object') || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		id = (typeof(id) === 'string') ? new ObjectID(id) : id;
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			collection.findOne({_id: id}, self._getInstrumentedCallback('findById', callback));
		});
	};

	this.insert = function(doc, callback) {
		if (!doc || typeof(doc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		if (doc.hasOwnProperty('_id')) {
			throw new Error('Unable to insert a document that already contains an _id property');
		}
		
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			doc = self._cloneDocument(doc, schema);
			doc.created = new Date();
			doc.modified = new Date();

			var schemaError = joi.validate(doc, schema);
			if (schemaError) {
				return callback(new Error('A problem has occurred when validating the document: ' + JSON.stringify(schemaError)));
			}
			
			var icb = self._getInstrumentedCallback('insert', callback);
			collection.insert(doc, { safe: true }, function(error, newDocs) {
				if (error) {
					return icb(error);
				}
				icb(error, newDocs[0]);
			});
		});
	};

	this.update = function(id, doc, callback) {
		if (!id || typeof(id) !== 'string' || !doc || typeof(doc) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			var icb = self._getInstrumentedCallback('update', callback);
			collection.findOne({ _id: id }, function(error, entry) {
				if (error) {
					return icb(error);
				}
				if (!entry) {
					return icb(error, false);
				}
				doc = self._cloneDocument(doc, schema);
				doc.modified = new Date();
				doc.created = entry.created;

				var schemaError = joi.validate(doc, schema);
				if (schemaError) {
					return icb(new Error('A problem has occurred when validating the document: ' + JSON.stringify(schemaError)));
				}

				collection.update({ _id: id }, doc, { safe: true, multi: false }, icb);
				
			});
		});
		
	};



	this.remove = function(id, callback) {
		if (!id || typeof(id) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			id = (typeof(id) === 'string') ? new ObjectID(id) : id;

			var icb = self._getInstrumentedCallback('remove', callback);
			collection.findOne({ _id: id }, function(error, entry) {
				if (error) {
					return icb(error);
				}
				if (!entry) {
					return icb(error, false);
				}
				collection.remove({ _id: id }, { safe: true }, icb);
				
			});
		});
	};

	this.removeAll = function(callback) {
		if (!callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			collection.remove({ }, { safe: true }, self._getInstrumentedCallback('removeAll', callback));
		});
	};
};



