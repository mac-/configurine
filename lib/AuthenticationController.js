module.exports = function AuthenticationController(options) {
	
	var self = this,
		Hapi = require('hapi'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		AuthenticationMgr = require('./api/AuthenticationMgr'),
		authenticationMgr = new AuthenticationMgr(options),


		handlePostToken = function(request, reply) {
			if (request.payload.grant_type === 'password') {
				authenticationMgr.authenticateUserClient(request.payload.username, request.payload.password, parseInt(request.payload.timestamp, 10), function(err, token) {
					if (err || !token) {
						logger.log('Error:', err || 'no token');
						return reply(Hapi.error.badRequest('Invalid credentials'));
					}
					reply({ access_token: token });
				});
			}
			else if (request.payload.grant_type === 'system') {
				authenticationMgr.authenticateSystemClient(request.payload.system, request.payload.sharedKey, parseInt(request.payload.timestamp, 10), request.payload.signature, function(err, token) {
					if (err || !token) {
						logger.log('Error:', err || 'no token');
						return reply(Hapi.error.badRequest('Invalid credentials'));
					}
					reply({ access_token: token });
				});
			}
			else {
				reply(Hapi.error.badRequest('Invalid grant type'));
			}
		};
		
	this.routes = [
		{
			path: '/token',
			method: 'POST',
			handler: handlePostToken,
			config: {
				description: 'Request a token based on the provided credentials',
				notes: 'POST',
				tags: 'POST',
				payload: 'parse',
				validate: {
					payload: {
						grant_type: Hapi.types.String().valid('password', 'system').min(1).optional(),
						username: Hapi.types.String().min(1).with('password').optional(),
						password: Hapi.types.String().min(1).with('username').optional(),
						signature: Hapi.types.String().min(1).with('sharedKey').optional(),
						sharedKey: Hapi.types.String().min(1).with('signature').optional(),
						timestamp: Hapi.types.Number().min(1).required()
					}
				}
			}
		}
	];

	logger.log('AuthenticationController()');

};