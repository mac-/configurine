var BaseSvc = require('./BaseSvc.js'),
	util = require('util'),
	configSchema = require('./ConfigSchema.js');

function ConfigSvc(options) {

	options = options || {};
	options.db = options.db || {};
	options.db.name = 'configurine';
	options.db.collectionName = 'config';
	options.db.indeces = [{
		index: {name: 1, 'associations.environments': 1},
		unique: false
	}, {
		index: {'associations.applications.name': 1, 'associations.applications.versions': 1},
		unique: false
	}, {
		index: {'associations.environments': 1},
		unique: false
	}];
	options.db.schema = configSchema;

	var self = this,
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}};

	BaseSvc.call(this, options);

	// finds a collection of config entries by name
	this.findByName = function(names, callback) {
		if (!names || (typeof(names) !== 'string' && typeof(names) !== 'object') || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		names = (names instanceof Array) ? names : [names];
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			collection.find({name: {"$in": names} }).toArray(self._getInstrumentedCallback('findByName', callback));
		});
	};

	// finds a collection of config entries by a single app association
	this.findByApplicationAssociation = function(appName, appVersion, callback) {
		if (!appName || typeof(appName) !== 'string' || !appVersion || typeof(appVersion) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			collection.find({"associations.applications.name": appName, "associations.applications.versions": {"$in": [appVersion] } }).toArray(self._getInstrumentedCallback('findByApplicationAssociation', callback));
		});
	};

	// finds a collection of config entries by a single environment association
	this.findByEnvironmentAssociation = function(envName, callback) {
		if (!envName || typeof(envName) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			collection.find({"associations.environments": { "$in": [envName]} }).toArray(self._getInstrumentedCallback('findByEnvironmentAssociation', callback));
		});
	};

	// finds a collection of config entries by name and one or more associations
	this.findByNameAndEnvironmentAssociation = function(names, envName, callback) {
		if (!names || (typeof(names) !== 'string' && typeof(names) !== 'object') || !envName || typeof(envName) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		names = (names instanceof Array) ? names : [names];
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			collection.find({name: {"$in": names}, "associations.environments": { "$in": [envName]} }).toArray(self._getInstrumentedCallback('findByNameAndEnvironmentAssociation', callback));
		});
	};


};

util.inherits(ConfigSvc, BaseSvc);

module.exports = ConfigSvc;
