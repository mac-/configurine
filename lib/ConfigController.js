module.exports = function ConfigController(options) {
	
	var self = this,
		timer,
		Hapi = require('hapi'),
		_ = require('underscore'),
		async = require('async'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		statsdClient = options.statsdClient || {increment:function(){},decrement:function(){},counter:function(){},guage:function(){},timing:function(){},getChildClient:function(){return this;}},
		ConfigSvc = require('./api/ConfigSvc'),
		configSvc = new ConfigSvc(options),
		ClientSvc = require('./api/ClientSvc'),
		clientSvc = new ClientSvc(options),
		cacheOptions = {
			mode: 'client+server',
			privacy: 'private',
			expiresIn: 300000 // 5 mins
		},

		validateQueryParams = function(queryObj) {
			var i, isValid = true;
			if (isValid && queryObj.names !== undefined && queryObj.names !== null) {
				queryObj.names = (queryObj.names instanceof Array) ? queryObj.names : [queryObj.names];
				for (i = 0; i < queryObj.names.length; i++) {
					if (!queryObj.names[i] || typeof(queryObj.names[i]) !== 'string') {
						isValid = false;
						break;
					}
				}
			}
			if (isValid && queryObj.associations !== undefined && queryObj.associations !== null) {
				queryObj.associations = (queryObj.associations instanceof Array) ? queryObj.associations : [queryObj.associations];
				for (i = 0; i < queryObj.associations.length; i++) {
					if (!queryObj.associations[i] || typeof(queryObj.associations[i]) !== 'string') {
						isValid = false;
						break;
					}
				}
			}

			return isValid;
		},

		formatResults = function(configEntry) {
			if (configEntry instanceof Array) {
				for (var i = 0; i < configEntry.length; i++) {
					formatResults(configEntry[i]);
				}
			}
			else {
				configEntry.id = configEntry._id.toString();
				delete configEntry._id;
				delete configEntry.created;
				delete configEntry.modified;
			}
		},

		parseAssociationsFromQueryString = function(queryObj) {
			var i, parts, associations = {
					applications: [],
					environments: []
				};
			if (queryObj.associations && queryObj.associations.length > 0) {
				if (queryObj.associations.length !== _.uniq(queryObj.associations).length) {
					throw new Error('duplicate query string parameters');
				}
				for (i = 0; i < queryObj.associations.length; i++) {
					parts = queryObj.associations[i].split('|');
					if (parts[0] === 'application' && parts.length === 3) {
						statsdClient.increment('querystring.associations.application.' + parts[1] + '-' + parts[2]);
						associations.applications.push({ name: parts[1], version: parts[2] });
					}
					else if (parts[0] === 'environment' && parts.length === 2) {
						statsdClient.increment('querystring.associations.environment.' + parts[1]);
						associations.environments.push(parts[1]);
					}
					else {
						statsdClient.increment('querystring.associations.unrecognized');
						logger.log('Ignoring unrecognized association: ' + queryObj.associations[i]);
						throw new Error('Unrecognized association parsed from query string parameters');
					}
				}
			}
			else {
				statsdClient.increment('querystring.associations.none');
			}
			return associations;
		},

		getClientFromToken = function(request, next) {
			next(request.raw.req.headers['authorization'].split(':')[0]);
		},

		handleGetConfigById = function(request, reply) {
			configSvc.findById(request.params.id, function(err, result) {
				if (err) {
					logger.error('Error: ' + err.stack);
					return reply(Hapi.error.internal());
				}
				if (result) {
					formatResults(result);
					reply(result);
				}
				else {
					reply(Hapi.error.notFound());
				}
			});
		},
		handlePostConfig = function(request, reply) {
			clientSvc.findByName(request.pre.clientId, function(err, result) {
				if (err) {
					logger.error('Error: ' + err.stack);
					return reply(Hapi.error.internal());
				}
				if (!result.isConfirmed) {
					return reply(Hapi.error.badRequest('Client ' + request.pre.clientId + ' has not been confirmed yet.'));
				}
				request.payload.owner = request.pre.clientId;
				configSvc.insert(request.payload, function(err, result) {
					if (err) {
						logger.error('Error: ' + err.stack);
						return reply(Hapi.error.internal());
					}
					var response = new Hapi.response.Empty();
					response.created('config/' + result._id.toString());
					reply(response);
				});
			});
		},
		handlePutConfig = function(request, reply) {
			if (request.payload.hasOwnProperty('id') && request.params.id !== request.payload.id) {
				return reply(Hapi.error.badRequest('Unable to change the ID on the config object. Please ensure the ID in the path matches the ID in the payload.'));
			}

			configSvc.findById(request.params.id, function(err, result) {
				if (err) {
					logger.error('Error: ' + err.stack);
					return reply(Hapi.error.internal());
				}
				if (!result) {
					return reply(Hapi.error.notFound());
				}
				if (result.owner !== request.pre.clientId) {
					return reply(Hapi.error.forbidden());
				}

				configSvc.update(request.params.id, request.payload, function(err, result) {
					if (err) {
						logger.error('Error: ' + err.stack);
						return reply(Hapi.error.internal());
					}
					if (result) {
						var response = new Hapi.response.Empty();
						response.code(204);
						reply(response);
					}
					else {
						reply(Hapi.error.notFound());
					}
				});
			});
			
		},
		handleDeleteConfig = function(request, reply) {
			configSvc.findById(request.params.id, function(err, result) {
				if (err) {
					logger.error('Error: ' + err.stack);
					return reply(Hapi.error.internal());
				}
				if (!result) {
					return reply(Hapi.error.notFound());
				}
				if (result.owner !== request.pre.clientId) {
					return reply(Hapi.error.forbidden());
				}

				configSvc.remove(request.params.id, function(err, result) {
					if (err) {
						logger.error('Error: ' + err.stack);
						return reply(Hapi.error.internal());
					}
					if (result) {
						var response = new Hapi.response.Empty();
						response.code(204);
						reply(response);
					}
					else {
						reply(Hapi.error.notFound());
					}
				});
			});
		},
		handleGetConfig = function(request, reply) {
			if (!validateQueryParams(request.query)) {
				return reply(Hapi.error.badRequest('One or more query string parameter is malformed'));
			}
			var i, hasAppAssociations = false,
				associations,
				parallelFuncs = [];

			try {
				associations = parseAssociationsFromQueryString(request.query);
			}
			catch (ex) {
				return reply(Hapi.error.badRequest(ex.message));
			}
			
			if (associations.applications.length === 0 && associations.environments.length === 0 && (!request.query.names || request.query.names.length === 0)) {
				parallelFuncs.push(function(callback) {
					configSvc.findAll({}, callback);
				});
			}
			else {
				if (associations.applications.length > 0) {
					hasAppAssociations = true;
					// add call to findByApplicationAssociation
					for (i = 0; i < associations.applications.length; i++) {
						parallelFuncs.push((function(app) {
							return function(callback) {
								configSvc.findByApplicationAssociation(app.name, app.version, callback);
							};
						}(associations.applications[i])));
					}

				}
				if (associations.environments.length > 0 && request.query.names && request.query.names.length > 0) {
					// add call to findByNameAndEnvironmentAssociation
					for (i = 0; i < associations.environments.length; i++) {
						parallelFuncs.push((function(envName) {
							return function(callback) {
								configSvc.findByNameAndEnvironmentAssociation(request.query.names, envName, callback);
							};
						}(associations.environments[i])));
					}
				}
				else if (associations.environments.length > 0 && (!request.query.names || request.query.names.length === 0)) {
					// add call to findByEnvironmentAssociation
					for (i = 0; i < associations.environments.length; i++) {
						parallelFuncs.push((function(envName) {
							return function(callback) {
								configSvc.findByEnvironmentAssociation(envName, callback);
							};
						}(associations.environments[i])));
					}
				}
				else if (associations.applications.length === 0 && associations.environments.length === 0 && request.query.names.length > 0) {
					// add call to findByName
					parallelFuncs.push(function(callback) {
						configSvc.findByName(request.query.names, callback);
					});
				}
			}

			async.parallel(parallelFuncs, function(err, result) {
				if (err) {
					logger.error('Error: ' + err.stack);
					return reply(Hapi.error.internal());
				}
				result = _.flatten(result);
				// filter results from app associations if names filter is provided
				if (hasAppAssociations && request.query.names && request.query.names.length > 0) {
					// filter results by name
					result = _.filter(result, function(item) { return request.query.names.indexOf(item.name) >= 0; });
				}

				if (request.query.hasOwnProperty('isActive')) {
					result = _.filter(result, function(item) { return (item.isActive.toString() === request.query.isActive); });
				}

				if (!request.auth.isAuthenticated) {
					result = _.filter(result, function(item) { return !item.isSensitive; });
				}

				formatResults(result);

				// remove duplicate entries
				var ids = _.pluck(result, 'id');
				if (ids.length !== _.uniq(ids).length) {
					var savedIds = [];
					result = _.filter(result, function(item) {
						if (savedIds.indexOf(item.id) >= 0) {
							return false;
						}
						savedIds.push(item.id);
						return true;
					});
				}
				reply(result);
			});
		};
		
	this.routes = [
		{
			path: '/config/{id}',
			method: 'GET',
			handler: handleGetConfigById,
			config: {
				description: 'Get a single config entry by ID',
				notes: 'GET',
				tags: 'GET',
				auth: 'oauth2',
				cache: cacheOptions,
				validate: {
					path: {
						id: Hapi.types.String().required()
					}
				}
			}
		},
		{
			path: '/config',
			method: 'GET',
			handler: handleGetConfig,
			config: {
				description: 'Get a collection of config entries filtered by query string params',
				notes: 'GET',
				tags: 'GET',
				auth: {	// this route doesn't require authentication, but will still validate the token if it exists
					mode: 'optional',
					strategy: 'oauth2'
				},
				cache: cacheOptions,
				validate: {
					query: {
						names: Hapi.types.Array().optional(),
						associations: Hapi.types.Array().optional(),
						isActive: Hapi.types.Boolean().optional()
					}
				}
			}
		},
		{
			path: '/config',
			method: 'POST',
			handler: handlePostConfig,
			config: {
				description: 'Create a new config entry',
				notes: 'POST',
				tags: 'POST',
				auth: 'oauth2',
				payload: 'parse',
				pre: [
					{ method: getClientFromToken, assign: 'clientId' }
				],
				validate: {
					payload: {
						name: Hapi.types.String().min(1).required(),
						value: Hapi.types.Object().required(),
						associations: Hapi.types.Object().required(),
						isSensitive: Hapi.types.Boolean().required(),
						isActive: Hapi.types.Boolean().required()
					}
				}
			}
		},
		{
			path: '/config/{id}',
			method: 'PUT',
			handler: handlePutConfig,
			config: {
				description: 'Update an existing config entry',
				notes: 'PUT',
				tags: 'PUT',
				auth: 'oauth2',
				payload: 'parse',
				pre: [
					{ method: getClientFromToken, assign: 'clientId' }
				],
				validate: {
					path: {
						id: Hapi.types.String().required()
					},
					payload: {
						id: Hapi.types.String().min(1).required(),
						name: Hapi.types.String().min(1).required(),
						value: Hapi.types.Object().required(),
						associations: Hapi.types.Object().required(),
						isSensitive: Hapi.types.Boolean().required(),
						isActive: Hapi.types.Boolean().required(),
						owner: Hapi.types.String().min(1).required()
					}
				}
			}
		},
		{
			path: '/config/{id}',
			method: 'DELETE',
			handler: handleDeleteConfig,
			config: {
				description: 'Remove an existing config entry',
				notes: 'DELETE',
				tags: 'DELETE',
				auth: 'oauth2',
				pre: [
					{ method: getClientFromToken, assign: 'clientId' }
				],
				validate: {
					path: {
						id: Hapi.types.String().required()
					}
				}
			}
		}
	];

	logger.log('ConfigController()');

};