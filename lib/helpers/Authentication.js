var Hapi = require('hapi'),
	AuthenticationMgr = require('../api/AuthenticationMgr');



module.exports = function(options) {

	var token, authMgr = new AuthenticationMgr(options),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}};

	this.authenticate = function(request, callback) {
		token = request.raw.req.headers['authorization'];

		if (!token) {
			process.nextTick(function() {
				// flags error as missing authentication header... allows for "optional" authentication
				callback(Hapi.error.unauthorized('', 'oauth2'));
			});
		}
		else {
			logger.log('Validating token: ', token);
			authMgr.validateToken(token, function(err, isValid) {
				if (err) {
					return callback(Hapi.error.unauthorized('Unauthorized: ' + err.message));
				}
				if (isValid) {
					callback(null, {}, {artifacts: {}});
				}
				else {
					callback(Hapi.error.unauthorized('Unauthorized: Invalid Token'));
				}
			});
		}
	};
};