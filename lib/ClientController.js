module.exports = function ClientController(options) {
	
	var self = this,
		Hapi = require('hapi'),
		uuid = require('node-uuid'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		AuthenticationMgr = require('./api/AuthenticationMgr'),
		authenticationMgr = new AuthenticationMgr(options),

		getClientFromToken = function(request, next) {
			next(request.raw.req.headers['authorization'].split(':')[0]);
		},
		handlePostRegister = function(request, reply) {

			// internally, uses node's crypto.randomBytes
			var sharedKey = uuid.v4();
			authenticationMgr.addClient(request.payload.client_id, request.payload.email, sharedKey, false, function(err, result) {
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
		handlePutClients = function(request, reply) {
			if (request.params.clientId !== request.payload.clientId) {
				return reply(Hapi.error.badRequest('Unable to change the ID on the client object. Please ensure the ID in the path matches the ID in the payload.'));
			}
			// only admins can update other clients
			authenticationMgr.isAdmin(request.pre.clientId, function(err, isAdmin) {
				if (err) {
					return reply(Hapi.error.internal());
				}
				if (!isAdmin) {
					return reply(Hapi.error.forbidden());
				}
				authenticationMgr.updateClient(request.payload.clientId, request.payload.email, request.payload.isConfirmed, request.payload.isAdmin, function(err, result) {
					if (err) {
						return reply(Hapi.error.internal());
					}
					var response = new Hapi.response.Empty();
					response.code(204);
					reply(response);
				});
			});
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
			path: '/clients/{clientId}',
			method: 'PUT',
			handler: handlePutClients,
			config: {
				description: 'Updates a client',
				notes: 'PUT',
				tags: 'PUT',
				payload: 'parse',
				auth: 'oauth2',
				pre: [
					{ method: getClientFromToken, assign: 'clientId' }
				],
				validate: {
					payload: {
						email: Hapi.types.String().email().required(),
						clientId: Hapi.types.String().min(3).required(),
						isAdmin: Hapi.types.Boolean().required(),
						isConfirmed: Hapi.types.Boolean().required()
					}
				}
			}
		}
	];

	logger.log('ClientController()');

};