module.exports = function(options) {
	
	var self = this,
		timer,
		_ = require('underscore'),
		async = require('async'),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		restify = require('restify'),
		ConfigMgr = require('./domain/ConfigMgr'),
		configMgr = new ConfigMgr(options),
		OutputCache = require('output-cache'),
		outputCache = new OutputCache({maxCacheSizePerRoute: options.maxCacheSize, removeOldEntriesWhenFull: true});

	logger.log('Controller()');

	// Private methods, made public for unit testing
	this._getTagsFromQueryString = function(queryObj) {
		logger.log('Controller._getTagsFromQueryString()');
		var tags = [], tagParts;
		if (queryObj.hasOwnProperty('tags') && queryObj.tags.length > 0) {
			tags = queryObj.tags.split(';');
			if (tags[tags.length-1].length < 1) {
				tags.pop();
			}
			for (var i = 0; i < tags.length; i++) {
				if (tags[i].length > 0) {
					tagParts = tags[i].split(':');
					if (tagParts.length < 2) {
						throw new Error('Unable to parse the tags from the query string.');
					}
					else if (tagParts.length > 2) {
						tagParts[1] = tags[i].substr(tags[i].indexOf(':') + 1);
					}
					tags[i] = {
						type: tagParts[0].toLowerCase(),
						value: tagParts[1]
					};
				}
			}
		}
		return tags;
	};

	this._parseQueryStringParameters = function(queryObj) {
		logger.log('Controller._parseQueryStringParameters()');
		var selector = {};
		if (queryObj.hasOwnProperty('name') && queryObj.name.length > 0) {
			selector.name = queryObj.name;
		}
		if (queryObj.hasOwnProperty('isActive') && queryObj.isActive.length > 0) {
			selector.isActive = (queryObj.isActive === 'true') ? true : false;
		}
		var tags = self._getTagsFromQueryString(queryObj);
		if (tags && tags.length > 0) {
			selector.tags =  {$all: tags};
		}
		return selector;
	};

	

	// Public methods
	this.initializeRoutes = function(server) {
		logger.log('Controller.initializeRoutes()');
		// init middleware
		server.use(restify.bodyParser({ mapParams: false }));
		server.use(restify.queryParser({ mapParams: true }));
		server.use(restify.authorizationParser());

		// TODO: make all of these more robust, include better authentication?
		/*
		server.post('/invalidateConfig', function(req, res, next) {
			configMgr.isAuthenticated(req.authorization, function(err, canGetSensitiveValues) {
				if (err) {
					return next(new restify.InternalError('Internal server error'));
				}
				res.send(204);
			});
		});
		*/

		var cachingOptions = {
			location: outputCache.cacheLocation.SERVER,
			varyByParam: ['name', 'tags'],
			varyByHeader: ['Authorization'],
			durationSeconds: options.secondsToCache
		};
		// Main route that applciations will use to get a single config value based on name and tags
		outputCache.get(server, '/config', cachingOptions, function(req, res, next) {
			logger.log('Route hit: GET /config');

			timer = new Date().getTime();
			configMgr.isAuthenticated(req.authorization, function(err, canGetSensitiveValues) {
				logger.info('Time taken to check if user is valid:', new Date().getTime() - timer, 'ms');
				if (err) {
					logger.error('Error while checking if user is authenticated:', err);
					return next(new restify.InternalError('Internal server error'));
				}
				// don't return cached response until auth has been validated
				if (req.cachedResponse) {
					_.each(req.cachedResponse.headers, function(value, key) {
						res.setHeader(key, value);
					});
					var responseObj = {};
					try {
						responseObj = JSON.parse(req.cachedResponse.responseBody);
					}
					catch (ex) {}
					// if the parsing of the resposne body succeeded, let's send the cached response
					if (!_.isEmpty(responseObj)) {
						return res.send(req.cachedResponse.status, responseObj);
					}
				}
				var cfgObj = {}, names,
					name = (req.query.hasOwnProperty('name') && req.query.name.length > 0) ? req.query.name : '',
					tags = [];
				try {
					names = name.split(';');
					tags = self._getTagsFromQueryString(req.query);
				}
				catch (ex) {
					logger.error('Error parsing names or tags from query string:', err);
					return next(new restify.BadRequestError('Internal server error'));
				}

				// build an async obj that has a call to configMgr for each name supplied ont eh request
				var asyncObj = {};
				_.each(names, function(name) {
					asyncObj[name] = function(callback) { configMgr.findOneByNameAndTags(name, tags, canGetSensitiveValues, callback); };
				});

				timer = new Date().getTime();
				async.parallel(asyncObj, function(err, results) {
					logger.info('Time taken to find all possible config entries:', new Date().getTime() - timer, 'ms');
					if (err) {
						if (err.message && err.message.indexOf('Config conflict') === 0) {
							logger.error('Conflicting config entries!', err);
							return next(new restify.ConflictError(err.message));
						}
						logger.error('Error while finding config value:', err);
						return next(new restify.InternalError('Internal server error'));
					}
					else {
						cfgObj.config = results;
						res.send(200, cfgObj);
					}
				});
			});
			
		});


		//TODO: Add routes for managing config users and tag types




		// TODO: should this be a POST?
		server.get('/authenticate', function (req, res, next) {
			logger.log('Route hit: GET /authenticate');
			configMgr.isAuthenticated(req.authorization, function(err, isValid) {
				if (err) {
					logger.error('Error while checking if user is authenticated:', err);
					return next(new restify.InternalError('Internal server error'));
				}
				if (!isValid) {
					return next(new restify.InvalidCredentialsError('Invalid Credentials'));
				}

				res.send(200, { status: 'authenticated' });
			});
			
		});




		// TODO: create routes for managing tags typs and users
		// TODO: support versioning on routes

		server.get('/configEntries/:id', function (req, res, next) {
			logger.log('Route hit: GET /configEntries/:id');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (err) {
					logger.error('Error while checking if user is authenticated:', err);
					return next(new restify.InternalError('Internal server error'));
				}
				else if (!isAuthenticated) {
					return next(new restify.InvalidCredentialsError('Not Authenticated'));
				}
				configMgr.findById(req.params.id, req.authorization, function (err, configDocument) {
					if (err) {
						logger.error('Error while finding config entry by ID:', req.params.id, err);
						return next(new restify.InternalError('Internal server error'));
					}
					else {
						if (!configDocument) {
							return next(new restify.ResourceNotFoundError('Resource not found'));
						}
						res.send(200, configDocument);
					}
				});
			});
		});

		// TODO: add paging
		server.get('/configEntries', function (req, res, next) {
			logger.log('Route hit: GET /configEntries');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (err) {
					logger.error('Error while checking if user is authenticated:', err);
					return next(new restify.InternalError('Internal server error'));
				}
				else if (!isAuthenticated) {
					return next(new restify.InvalidCredentialsError('Not Authenticated'));
				}
				var selector = self._parseQueryStringParameters(req.query);
				configMgr.findAll(selector, req.authorization, function (err, configDocument) {
					if (err) {
						logger.error('Error while finding all config entries:', err);
						return next(new restify.InternalError('Internal server error'));
					}
					else {
						if (!configDocument) {
							return next(new restify.ResourceNotFoundError('Resource not found'));
						}
						res.send(configDocument);
					}
				});
			});
		});

		//TODO: add route for searching for tags


		server.post('/configEntries', function (req, res, next) {
			logger.log('Route hit: POST /configEntries');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (err) {
					logger.error('Error while checking if user is authenticated:', err);
					return next(new restify.InternalError('Internal server error'));
				}
				else if (!isAuthenticated) {
					return next(new restify.InvalidCredentialsError('Not Authenticated'));
				}

				if (typeof req.body.data === 'object') {
					try {
						req.body.data = JSON.stringify(req.body.data);
					}
					catch(ex) {
						logger.error('Error while parsing the request body:', err);
						return next(new restify.BadRequest('Unable to parse the date submitted'));
					}
				}
				configMgr.insert(req.body, req.authorization, function (error, configDocument) {
					if (error) {
						logger.error('Error while inserting config document:', err);
						return next(new restify.InternalError('Internal server error'));
					}
					res.writeHead(201, {
						'Location': req.url + '/' + configDocument[0]._id
					});
					res.end();
				});
			});
		});

		server.put('/configEntries/:id', function (req, res, next) {
			logger.log('Route hit: PUT /configEntries/:id');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (err) {
					logger.error('Error while checking if user is authenticated:', err);
					return next(new restify.InternalError('Internal server error'));
				}
				else if (!isAuthenticated) {
					return next(new restify.InvalidCredentialsError('Not Authenticated'));
				}
				if (typeof req.body.data === 'object') {
					try {
						req.body.data = JSON.stringify(req.body.data);
					}
					catch(ex) {
						logger.error('Error while parsing the request body:', err);
						return next(new restify.BadRequest('Unable to parse the date submitted'));
					}
				}
				configMgr.update(req.params.id, req.body.data, req.authorization, function (err, count) {
					if (err) {
						logger.error('Error while updating config document by ID:', req.params.id, err);
						return next(new restify.InternalError('Internal server error'));
					}
					else {
						res.send(204);
					}
				});
			});
		});

		server.del('/configEntries/:id', function (req, res, next) {
			logger.log('Route hit: DELETE /configEntries/:id');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (err) {
					logger.error('Error while checking if user is authenticated:', err);
					return next(new restify.InternalError('Internal server error'));
				}
				else if (!isAuthenticated) {
					return next(new restify.InvalidCredentialsError('Not Authenticated'));
				}
				configMgr.remove(req.params.id, req.authorization, function (err, count) {
					if (err) {
						logger.error('Error while removing config document by ID:', req.params.id, err);
						return next(new restify.InternalError('Internal server error'));
					}
					else {
						if (!count) {
							return next(new restify.ResourceNotFoundError('Resource not found'));
						}
						res.send(204);
					}
				});
			});
		});
	};
};