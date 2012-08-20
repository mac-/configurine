module.exports = function(options) {
	
	var self = this,
		timer,
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		restify = require('restify'),
		ConfigMgr = require('./domain/ConfigMgr'),
		configMgr = new ConfigMgr(options);

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
					return next(new restify.InternalError("Internal server error"));
				}
				res.send(204);
			});
		});
		*/
		// Main route that applciations will use to get a single config value based on name and tags
		//TODO: support getting multiple values at once
		server.get('/configurineEntries/:name', function(req, res, next) {
			
			logger.log('Route hit: GET /configurineEntries/:name');
			timer = new Date().getTime();
			configMgr.isAuthenticated(req.authorization, function(err, canGetSensitiveValues) {
				logger.info('Time taken to check if user is valid:', new Date().getTime() - timer, 'ms');
				console.log(err);
				if (err) {
					return next(new restify.InternalError("Internal server error"));
				}
				var cfgObj = {},
					name = (req.params.hasOwnProperty('name') && req.params.name.length > 0) ? req.params.name : '',
					tags = [];
				try {
					tags = self._getTagsFromQueryString(req.query);
				}
				catch (ex) {
					return next(new restify.InternalError("Internal server error"));
				}
				timer = new Date().getTime();
				configMgr.findOneByNameAndTags(name, tags, canGetSensitiveValues, function (err, configValue) {
					logger.info('Time taken to find all possible config entries:', new Date().getTime() - timer, 'ms');
					if (err) {
						if (err.message && err.message.indexOf('Config conflict') === 0) {
							return next(new restify.ConflictError(err.message));
						}
						console.log(err);
						return next(new restify.InternalError("Internal server error"));
					} else {
						if (configValue === null || configValue === undefined) {
							return next(new restify.ResourceNotFoundError("Resource not found"));
						}
						cfgObj.name = name;
						cfgObj.value = configValue;
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
					return next(new restify.InternalError("Internal server error"));
				}
				if (!isValid) {
					return next(new restify.InvalidCredentialsError("Invalid Credentials"));
				}

				res.send(200, { status: 'authenticated' });
			});
			
		});




		// TODO: create routes for managing tags typs and users
		// TODO: support versioning on routes

		server.get('/configEntries/:id', function (req, res, next) {
			logger.log('Route hit: GET /configEntries/:id');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (!isAuthenticated || err) {
					return next(new restify.InvalidCredentialsError("Not Authenticated"));
				}
				configMgr.findById(req.params.id, function (err, configDocument) {
					if (err) {
						return next(new restify.InternalError("Internal server error"));
					} else {
						if (!configDocument) {
							return next(new restify.ResourceNotFoundError("Resource not found"));
						}
						res.send(200, configDocument);
					}
				});
			});
		});

		server.get('/configEntries', function (req, res, next) {
			logger.log('Route hit: GET /configEntries');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (!isAuthenticated || err) {
					return next(new restify.InvalidCredentialsError("Not Authenticated"));
				}
				var selector = self._parseQueryStringParameters(req.query);
				configMgr.findAll(selector, function (err, configDocument) {
					if (err) {
						return next(new restify.InternalError("Internal server error"));
					} else {
						if (!configDocument) {
							return next(new restify.ResourceNotFoundError("Resource not found"));
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
				if (!isAuthenticated || err) {
					return next(new restify.InvalidCredentialsError("Not Authenticated"));
				}

				if (typeof req.body.data === 'object') {
					try {
						req.body.data = JSON.stringify(req.body.data);
					}
					catch(ex) {
						return next(new restify.BadRequest("Unable to parse the date submitted"));
					}
				}
				configMgr.insert(req.body, req.authorization, function (error, configDocument) {
					if (error) {
						return next(new restify.InternalError("Internal server error"));
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
				if (!isAuthenticated || err) {
					return next(new restify.InvalidCredentialsError("Not Authenticated"));
				}
				if (typeof req.body.data === 'object') {
					try {
						req.body.data = JSON.stringify(req.body.data);
					}
					catch(ex) {
						return next(new restify.BadRequest("Unable to parse the date submitted"));
					}
				}
				configMgr.update(req.params.id, req.body.data, req.authorization, function (err, count) {
					if (err) {
						return next(new restify.InternalError("Internal server error"));
					} else {
						res.send(204);
					}
				});
			});
		});

		server.del('/configEntries/:id', function (req, res, next) {
			logger.log('Route hit: DELETE /configEntries/:id');
			configMgr.isAuthenticated(req.authorization, function(err, isAuthenticated) {
				if (!isAuthenticated || err) {
					return next(new restify.InvalidCredentialsError("Not Authenticated"));
				}
				configMgr.remove(req.params.id, req.authorization, function (err, count) {
					if (err) {
						return next(new restify.InternalError("Internal server error"));
					} else {
						if (!count) {
							return next(new restify.ResourceNotFoundError("Resource not found"));
						}
						res.send(204);
					}
				});
			});
		});
	};
};