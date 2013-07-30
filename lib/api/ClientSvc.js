var BaseSvc = require('./BaseSvc.js'),
	util = require('util'),
	clientSchema = require('./ClientSchema.js');

function ClientSvc(options) {

	options = options || {};
	options.db = options.db || {};
	options.db.name = 'configurine';
	options.db.collectionName = 'clients';
	options.db.indeces = [{
		index: { name: 1 },
		unique: false
	}];
	options.db.schema = clientSchema;

	var self = this,
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}};

	BaseSvc.call(this, options);

	// finds a collection of client entries by name
	this.findByName = function(name, callback) {
		if (!name || typeof(name) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			collection.findOne({name: name}, self._getInstrumentedCallback('findByName', callback));
		});
	};

	this.removeByName = function(name, callback) {
		if (!name || typeof(name) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		self._getCollection(function(error, collection) {
			if (error) {
				return callback(error);
			}
			var icb = self._getInstrumentedCallback('removeByName', callback);
			collection.findOne({ name: name }, function(error, entry) {
				if (error) {
					return callback(error);
				}
				if (!entry) {
					return callback(error, false);
				}
				collection.remove({ name: name }, { safe: true }, icb);
				
			});
		});
	};

};

util.inherits(ClientSvc, BaseSvc);

module.exports = ClientSvc;
