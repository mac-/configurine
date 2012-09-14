
var ConfigSvcFactory = require('../api/ConfigSvcFactory');
	

module.exports = function(options) {
	options = options || {};

	var configSvcFactory = new ConfigSvcFactory(options),
		tagTypePriority = null,
		configSvc = configSvcFactory.getConfigSvc(),
		configTagSvc = configSvcFactory.getTagSvc(),
		configUserSvc = configSvcFactory.getUserSvc(),
		logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		self = this;

	// private methods, made public for unit testing

	this._getTagPriority = function(callback) {
		if (!tagTypePriority) {
			configTagSvc.connect(function(error) {
				if (error) {
					return callback(error);
				}
				configTagSvc.findAll(function(error, result) {
					if (error || result.length < 1) {
						error = error || new Error('Unable to properly determine relavent config entries since there are no tag types defined in the "configTagTypes" collection.');
						return callback(error);
					}
					tagTypePriority = {};
					for (var i = 0; i < result.length; i++) {
						tagTypePriority[result[i].name] = result[i].priority;
					}
					callback(null, tagTypePriority);
				});

			});
		}
		else {
			process.nextTick(function() {
				callback(null, tagTypePriority);
			});
		}
	};

	this._getMostRelaventConfigObject = function(configCollection, currentTagsObj, callback) {
		if (!configCollection || !configCollection.length) {
			callback(new Error('Missing parameter: configCollection'));
		}
		if (!currentTagsObj || typeof(currentTagsObj) !== 'object') {
			callback(new Error('Missing parameter: configCollection'));
		}
		if (!callback || typeof(callback) !== 'function') {
			callback(new Error('Missing parameter: configCollection'));
		}
		var i, j, tag, index, isMatch, lowerCaseType, orderedConfig = [];
		var priorityTimer = new Date().getTime();

		logger.log('Determining best config match');
		self._getTagPriority(function(error, tagTypes) {
			if (error) {
				return callback(error);
			}
			logger.info('Time taken to get all tag priorities:', new Date().getTime() - priorityTimer, 'ms');
			var timer;
			for (i = 0; i < configCollection.length; i++) {
				index = 0;
				isMatch = true; // assume the config qualifies as a match

				// arrange all the tags on this config object by type
				var tagsByType = {};
				for (j = 0; j < configCollection[i].tags.length; j++) {
					tag = configCollection[i].tags[j];
					lowerCaseType = tag.type.toLowerCase();

					tagsByType[lowerCaseType] = tagsByType[lowerCaseType] || [];
					tagsByType[lowerCaseType].push(tag.value);
				}
				timer = new Date().getTime();
				// check each type
				for (var prop in tagsByType) {
					// do the tags that were passed in have this tag type?
					if (currentTagsObj.hasOwnProperty(prop) && currentTagsObj[prop].length > 0) {
						// does the value of this tag type match any on the config object?
						// TODO: support regex matching on tag values?
						if (tagsByType[prop].indexOf(currentTagsObj[prop]) > -1) {
							// if so, increment it's priority index
							index += tagTypes[prop];
						}
						else {
							// otherwise there is no match for this tag type, so flag it as not matching
							isMatch = false;
							break;
						}
					}
					else {
						// otherwise there is no match for this tag type, so flag it as not matching
						isMatch = false;
						break;
					}
				}
				// there can be multiple matches, so lets add any match to an array using the priority as the index
				if (isMatch) {
					if (orderedConfig[index] !== undefined) {
						error = new Error('Config conflict: Please remove duplicate config entries, or be more specific by specifying one or more tags.');
						return callback(error);
					}
					orderedConfig[index] = configCollection[i];
				}
			}
			logger.info('Time taken to find the best match:', new Date().getTime() - timer, 'ms');
			// the last item in the array will have the highest priority
			callback(null, orderedConfig.pop());
		});
	};


	// public methods

	this.isAuthenticated = function(auth, callback) {
		logger.log('Checking if user is valid and can read config');
		if (!auth || !auth.basic || !auth.basic.username) {
			return callback(null, false);
		}
		var timer = new Date().getTime();
		configUserSvc.connect(function(err) {
			if (err) {
				return callback(err);
			}
			configUserSvc.findByName(auth.basic.username, function(err, user) {
				logger.info('Time taken to find a given user:', new Date().getTime() - timer, 'ms');
				if (err) {
					return callback(err, null);
				}
				if (user) {
					callback(null, (user.password === auth.basic.password));
				}
				else {
					callback(null, false);
				}
			});
		});
	};

	this.canReadConfig = function(auth, callback) {
		logger.log('Checking if user can read config');
		if (!auth || !auth.basic || !auth.basic.username) {
			return callback(null, false);
		}
		var timer = new Date().getTime();
		configUserSvc.connect(function(err) {
			if (err) {
				return callback(err);
			}
			configUserSvc.findByName(auth.basic.username, function(err, user) {
				logger.info('Time taken to find a given user:', new Date().getTime() - timer, 'ms');
				if (err) {
					return callback(err, null);
				}
				if (user) {
					callback(null, (user.permissions >= configUserSvc.PERMISSIONS_READ_ONLY));
				}
				else {
					callback(null, false);
				}
			});
		});
	};

	this.canWriteConfig = function(auth, callback) {
		logger.log('Checking if user can write config');
		if (!auth || !auth.basic || !auth.basic.username) {
			return callback(null, false);
		}
		var timer = new Date().getTime();
		configUserSvc.connect(function(err) {
			if (err) {
				return callback(err);
			}
			configUserSvc.findByName(auth.basic.username, function(err, user) {
				logger.info('Time taken to find a given user:', new Date().getTime() - timer, 'ms');
				if (err) {
					return callback(err, null);
				}
				if (user) {
					callback(null, (user.permissions >= configUserSvc.PERMISSIONS_READ_WRITE));
				}
				else {
					callback(null, false);
				}
			});
		});
	};
	
	this.canAdminConfig = function(auth, callback) {
		logger.log('Checking if user can admin config');
		if (!auth || !auth.basic || !auth.basic.username) {
			return callback(null, false);
		}
		var timer = new Date().getTime();
		configUserSvc.connect(function(err) {
			if (err) {
				return callback(err);
			}
			configUserSvc.findByName(auth.basic.username, function(err, user) {
				logger.info('Time taken to find a given user:', new Date().getTime() - timer, 'ms');
				if (err) {
					return callback(err, null);
				}
				if (user) {
					callback(null, (user.permissions >= configUserSvc.PERMISSIONS_ADMIN));
				}
				else {
					callback(null, false);
				}
			});
		});
	};

	this.findOneByNameAndTags = function(name, tags, allowSensitiveValues, callback) {
		if (!name || typeof(name) !== 'string') {
			throw new Error('Missing parameters: name');
		}
		if (tags && typeof(tags) === 'function') {
			callback = tags;
			tags = [];
		}
		else if (!tags || typeof(tags) !== 'object') {
			throw new Error('Missing parameters: tags');
		}
		if (!callback || typeof(callback) !== 'function') {
			throw new Error('Missing parameters: callback');
		}
		logger.log('Checking tags');
		// create tags in an Object for _getMostRelaventConfigObject call and to check for duplicate types
		var tagsObj = {};
		tags.forEach(function(item) {
			if (tagsObj[item.type.toLowerCase()] !== undefined) {
				throw new Error('Invalid parameter: tags must not contain more than one tag with the same type.');
			}
			tagsObj[item.type.toLowerCase()] = item.value;
		});

		// get all by name
		var selector = {
			isActive: true,
			name: name
		};

		var timer = new Date().getTime();
		logger.log('Pulling possible config entries from DB');
		// if we don't want to allow sensitive values, make sure we specify that in the selctor,
		// otherwise we want both, so don't add it to the selector
		if (!allowSensitiveValues) {
			selector.isSensitive = allowSensitiveValues;
		}
		configSvc.connect(function(error) {
			if (error) {
				return callback(error, null);
			}
			configSvc.findAll(selector, function(error, configArray) {
				logger.info('Time taken to find all possible config values:', new Date().getTime() - timer, 'ms');
				if (error || !configArray || configArray.length === 0) {
					return callback(error, configArray);
				}
				timer = new Date().getTime();
				self._getMostRelaventConfigObject(configArray, tagsObj, function(error, config) {
					logger.info('Time taken to find the most relavent config entry:', new Date().getTime() - timer, 'ms');
					if (error) {
						// TODO: better messaging to client for exceptions
						return callback(error, null);
					}
					if (config !== undefined) {
						callback(error, config.value);
					}
					else {
						callback(error, null);
					}
				
				});
			});
		});

	};

	this.findById = function(id, auth, callback) {
		self.canReadConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configSvc.findById(id, callback);
			});
		});
	};

	this.findAll = function(selector, auth, callback) {
		self.canReadConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configSvc.findAll(selector, callback);
			});
		});
	};

	
	this.insert = function(configDoc, auth, callback) {
		self.canWriteConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configSvc.insert(configDoc, callback);
			});
		});
	};

	this.update = function(id, configDoc, auth, callback) {
		self.canWriteConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configSvc.update(id, configDoc, callback);
			});
		});
	};

	this.del = function(id, auth, callback) {
		self.canWriteConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configSvc.remove(id, callback);
			});
		});
	};

	//TODO: markAsActive and markAsInactive methods?





	this.findUserById = function(id, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configUserSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configUserSvc.findById(id, callback);
			});
		});
	};

	this.findAllUsers = function(selector, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configUserSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configUserSvc.findAll(selector, callback);
			});
		});
	};

	
	this.insertUser = function(configDoc, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configUserSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configUserSvc.insert(configDoc, callback);
			});
		});
	};

	this.updateUser = function(id, configDoc, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configUserSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configUserSvc.update(id, configDoc, callback);
			});
		});
	};

	this.delUser = function(id, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configUserSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configUserSvc.remove(id, callback);
			});
		});
	};







	this.findTagTypeById = function(id, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configTagSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configTagSvc.findById(id, callback);
			});
		});
	};

	this.findAllTagTypes = function(selector, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configTagSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configTagSvc.findAll(selector, callback);
			});
		});
	};

	
	this.insertTagTypes = function(configDoc, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configTagSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configTagSvc.insert(configDoc, callback);
			});
		});
	};

	this.updateTagType = function(id, configDoc, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configTagSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configTagSvc.update(id, configDoc, callback);
			});
		});
	};

	this.delTagType = function(id, auth, callback) {
		self.canAdminConfig(auth, function(err, canWrite) {
			if (err) {
				callback(err);
			}
			if (!canWrite) {
				callback(new Error('Unauthorized'));
			}
			configTagSvc.connect(function(err) {
				if (err) {
					callback(err);
				}
				configTagSvc.remove(id, callback);
			});
		});
	};
};