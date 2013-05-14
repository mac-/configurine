module.exports = function(options) {
	
	var self = this,
		timer,
		Hapi = require('hapi'),
		_ = require('underscore'),
		async = require('async'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		ConfigSvc = require('./api/ConfigSvc'),
		configSvc = new ConfigSvc(options),

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
				for (i = 0; i < queryObj.associations.length; i++) {
					parts = queryObj.associations[i].split('|');
					if (parts[0] === 'application' && parts.length === 3) {
						associations.applications.push({ name: parts[1], version: parts[2] });
					}
					else if (parts[0] === 'environment' && parts.length === 2) {
						associations.environments.push(parts[1]);
					}
					else {
						logger.log('Ignoring unrecognized association: ' + queryObj.associations[i]);
					}
				}

			}
			return associations;
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
			configSvc.insert(request.payload, function(err, result) {
				if (err) {
					logger.error('Error: ' + err.stack);
					return reply(Hapi.error.internal());
				}
				var response = new Hapi.response.Empty();
				response.created('config/' + result._id.toString());
				reply(response);
			});
		},
		handlePutConfig = function(request, reply) {
			if (request.payload.hasOwnProperty('id') && request.params.id !== request.payload.id) {
				return reply(Hapi.error.badRequest('Unable to change the ID on the config object. Please ensure the ID in the path matches the ID in the payload.'));
			}
			// TODO: authorize changes
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
		},
		handleDeleteConfig = function(request, reply) {
			// TODO: authorize all deletes
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
		},
		handleGetConfig = function(request, reply) {
			if (!validateQueryParams(request.query)) {
				return reply(Hapi.error.badRequest('One or more query string parameter is malformed'));
			}
			var i, hasAppAssociations = false,
				associations = parseAssociationsFromQueryString(request.query),
				parallelFuncs = [];

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
				if (associations.environments.length > 0 && request.query.names.length > 0) {
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
				if (hasAppAssociations && request.query.names && request.query.names.length > 0) {
					// filter results by name
					result = _.filter(result, function(item) { return request.query.names.indexOf(item.name); });
				}

				formatResults(result);
				if (request.query.hasOwnProperty('isActive')) {
					result = _.filter(result, function(item) { return (item.isActive === request.query.isActive); });
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
				payload: 'parse',
				validate: {
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
				payload: 'parse',
				validate: {
					path: {
						id: Hapi.types.String().required()
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