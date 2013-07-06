module.exports = function ClientController(options) {
	
	var self = this,
		Hapi = require('hapi'),
		uuid = require('node-uuid'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		AuthenticationMgr = require('./api/AuthenticationMgr'),
		authenticationMgr = new AuthenticationMgr(options),


		handlePostRegister = function(request, reply) {

			// internally, uses node's crypto.randomBytes
			var sharedKey = uuid.v4();
			authenticationMgr.addClient(request.payload.client_id, request.payload.email, sharedKey, function(err, result) {
				if (err) {
					if (err.message.indexOf('Conflict') === 0) {
						return reply(new Hapi.error(409, 'The client id ' + request.payload.client_id + ' already exists. Please choose a different client id to register.'));
					}
					return reply(Hapi.error.internal());
				}
				reply({
					client_id: result.name,
					sharedKey: result.sharedKey,
					email: result.email,
					isConfirmed: result.isConfirmed
				});

			});
		},
		handleGetConfirmRegistration = function(request, reply) {
			reply('not implemented');
		};
		
	this.routes = [
		{
			path: '/register',
			method: 'POST',
			handler: handlePostRegister,
			config: {
				description: 'Register a client',
				notes: 'POST',
				tags: 'POST',
				payload: 'parse',
				validate: {
					payload: {
						email: Hapi.types.String().email().required(),
						client_id: Hapi.types.String().min(3).required()
					}
				}
			}
		},
		{
			path: '/confirmRegistration',
			method: 'GET',
			handler: handleGetConfirmRegistration,
			config: {
				description: 'Confirms a client that recently registered',
				notes: 'GET',
				tags: 'GET',
				validate: {
					// validate QS here
				}
			}
		}
	];

	logger.log('ClientController()');

};