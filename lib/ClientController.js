module.exports = function ClientController(options) {
	
	var self = this,
		Hapi = require('hapi'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		AuthenticationMgr = require('./api/AuthenticationMgr'),
		authenticationMgr = new AuthenticationMgr(options),


		handlePostRegister = function(request, reply) {
			/*
			if (request.payload.grant_type === 'password') {
				logger.log('Attempting to authenticate user: ' + request.payload.username);
				authenticationMgr.authenticateUserClient(request.payload.username, request.payload.password, parseInt(request.payload.timestamp, 10), function(err, token) {
					if (err || !token) {
						logger.error('Error:', err || 'no token');
						return reply(Hapi.error.badRequest('Invalid credentials'));
					}
					reply({ access_token: token });
				});
			}
			else if (request.payload.grant_type === 'system') {
				logger.log('Attempting to authenticate system: ' + request.payload.system);
				authenticationMgr.authenticateSystemClient(request.payload.system, parseInt(request.payload.timestamp, 10), request.payload.signature, function(err, token) {
					if (err || !token) {
						logger.error('Error:', err || 'no token');
						return reply(Hapi.error.badRequest('Invalid credentials'));
					}
					reply({ access_token: token });
				});
			}
			else {
				reply(Hapi.error.badRequest('Invalid grant type'));
			}
			*/
		};
		
	this.routes = [
		{
			path: '/register',
			method: 'POST',
			handler: handlePostRegister,
			config: {
				description: 'Register a system user',
				notes: 'POST',
				tags: 'POST',
				payload: 'parse',
				validate: {
					payload: {
						email: Hapi.types.String().email().required(),
						system: Hapi.types.String().min(3).required()
					}
				}
			}
		},
		{
			path: '/confirmRegistration',
			method: 'GET',
			handler: handlePostRegister,
			config: {
				description: 'Confirms a system user that recently registered',
				notes: 'GET',
				tags: 'GET'
			}
		}
	];

	logger.log('AuthenticationController()');

};