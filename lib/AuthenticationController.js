module.exports = function AuthenticationController(options) {
	
	var self = this,
		Hapi = require('hapi'),
		TokenSchema = require('./schemas/TokenSchema'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		AuthenticationMgr = require('./api/AuthenticationMgr'),
		authenticationMgr = AuthenticationMgr.getInstance(options),


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
				payload: {
					allow: 'application/x-www-form-urlencoded'
				},
				plugins: {
					ratify: TokenSchema.POST
				}
			}
		}
	];

	logger.log('AuthenticationController()');

};