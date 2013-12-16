module.exports = function ClientController(options) {
	
	var self = this,
		Hapi = require('hapi'),
		uuid = require('node-uuid'),
		ClientSchema = require('./schemas/ClientSchema'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		AuthenticationMgr = require('./api/AuthenticationMgr'),
		authenticationMgr = AuthenticationMgr.getInstance(options),

		getClientFromToken = function(request, next) {
			next(request.raw.req.headers['authorization'].split(':')[0]);
		},
		checkIfAuthenticatedUserIsAdmin = function(request, next) {
			authenticationMgr.isAdmin(request.pre.clientId, function(err, isAdmin) {
				if (err) {
					return next(Hapi.error.internal());
				}
				next(isAdmin);
			});
		},
		handlePostClient = function(request, reply) {

			// internally, uses node's crypto.randomBytes
			var sharedKey = uuid.v4();
			authenticationMgr.addClient(request.payload.clientId, request.payload.email, sharedKey, false, function(err, result) {
				if (err) {
					if (err.message.indexOf('Conflict') === 0) {
						return reply(new Hapi.error(409, 'The client id ' + request.payload.clientId + ' already exists. Please choose a different client id to create.'));
					}
					return reply(Hapi.error.internal());
				}
				var response = new Hapi.response.Empty();
				response.created('clients/' + result.name);
				reply(response);
			});
		},
		handleGetClient = function(request, reply) {
			// only admins can get other clients
			if (!request.pre.isAdmin) {
				return reply(Hapi.error.forbidden());
			}

			authenticationMgr.getClient(request.params.clientId, function(err, result) {
				if (err) {
					return reply(Hapi.error.internal());
				}
				if (!result) {
					return reply(Hapi.error.notFound());
				}
				reply(result);
			});
		},
		handlePutClient = function(request, reply) {
			if (request.params.clientId !== request.payload.clientId) {
				return reply(Hapi.error.badRequest('Unable to change the ID on the client object. Please ensure the ID in the path matches the ID in the payload.'));
			}
			// only admins can update other clients
			if (!request.pre.isAdmin) {
				return reply(Hapi.error.forbidden());
			}
			authenticationMgr.updateClient(request.payload.clientId, request.payload.email, request.payload.isConfirmed, request.payload.isAdmin, function(err, result) {
				if (err) {
					return reply(Hapi.error.internal());
				}
				if (!result) {
					return reply(Hapi.error.notFound());
				}
				var response = new Hapi.response.Empty();
				response.code(204);
				reply(response);
			});
		},
		handleDeleteClient = function(request, reply) {
			
			// only admins can delete other clients
			if (!request.pre.isAdmin) {
				return reply(Hapi.error.forbidden());
			}

			if (request.params.clientId === request.pre.clientId) {
				return reply(Hapi.error.badRequest('Unable to delete client "' + request.params.clientId + 'while authenticated as that client. Please authenticate as a different admin client.'));
			}
			authenticationMgr.removeClient(request.params.clientId, function(err, result) {
				if (err) {
					return reply(Hapi.error.internal());
				}
				if (!result) {
					return reply(Hapi.error.notFound());
				}
				var response = new Hapi.response.Empty();
				response.code(204);
				reply(response);
			});
		};
		
	this.routes = [
		{
			path: '/clients',
			method: 'POST',
			handler: handlePostClient,
			config: {
				description: 'Creates a client',
				notes: 'POST',
				tags: 'POST',
				payload: 'parse',
				plugins: {
					ratify: ClientSchema.POST
				}
			}
		},
		{
			path: '/clients/{clientId}',
			method: 'GET',
			handler: handleGetClient,
			config: {
				description: 'Gets a client',
				notes: 'GET',
				tags: 'GET',
				payload: 'parse',
				auth: 'oauth2',
				pre: [
					{ method: getClientFromToken, assign: 'clientId' },
					{ method: checkIfAuthenticatedUserIsAdmin, assign: 'isAdmin' }
				],
				plugins: {
					ratify: ClientSchema.GET
				}
			}
		},
		{
			path: '/clients/{clientId}',
			method: 'PUT',
			handler: handlePutClient,
			config: {
				description: 'Updates a client',
				notes: 'PUT',
				tags: 'PUT',
				payload: 'parse',
				auth: 'oauth2',
				pre: [
					{ method: getClientFromToken, assign: 'clientId' },
					{ method: checkIfAuthenticatedUserIsAdmin, assign: 'isAdmin' }
				],
				plugins: {
					ratify: ClientSchema.PUT
				}
			}
		},
		{
			path: '/clients/{clientId}',
			method: 'DELETE',
			handler: handleDeleteClient,
			config: {
				description: 'Deletes a client',
				notes: 'DELETE',
				tags: 'DELETE',
				payload: 'parse',
				auth: 'oauth2',
				pre: [
					{ method: getClientFromToken, assign: 'clientId' },
					{ method: checkIfAuthenticatedUserIsAdmin, assign: 'isAdmin' }
				],
				plugins: {
					ratify: ClientSchema.DELETE
				}
			}
		}
	];

	logger.log('ClientController()');

};