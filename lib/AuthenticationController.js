module.exports = function AuthenticationController(options) {
	
	var self = this,
		Hapi = require('hapi'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		AuthenticationMgr = require('./api/AuthenticationMgr'),
		authenticationMgr = new AuthenticationMgr(options),


		handlePostToken = function(request, reply) {
			logger.log('Attempting to authenticate client_id: ' + request.payload.client_id);
			authenticationMgr.authenticateClient(request.payload.client_id, parseInt(request.payload.timestamp, 10), request.payload.signature, function(err, token) {
				if (err || !token) {
					logger.error('Error:', err || 'no token');
					return reply(Hapi.error.badRequest('Invalid credentials'));
				}
				reply({ access_token: token });
			});
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
						grant_type: Hapi.types.String().valid('client_credentials').min(1).required(),
						signature: Hapi.types.String().min(1).required(),
						client_id: Hapi.types.String().min(1).required(),
						timestamp: Hapi.types.Number().min(1).required()
					}
				}
			}
		}
	];

	logger.log('AuthenticationController()');

};