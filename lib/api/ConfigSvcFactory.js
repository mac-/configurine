var ConfigSvc = require('./ConfigSvc'),
	ConfigUserSvc = require('./ConfigUserSvc'),
	ConfigTagTypeSvc = require('./ConfigTagTypeSvc');

module.exports = function(options) {

	this.getConfigSvc = function() {
		return new ConfigSvc(options);
	};

	this.getUserSvc = function() {
		return new ConfigUserSvc(options);
	};

	this.getTagSvc = function() {
		return new ConfigTagTypeSvc(options);
	};
};