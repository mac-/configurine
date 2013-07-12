var crypto = require('crypto'),
	ClientSvc = require('./ClientSvc'),
	uuid = require('node-uuid'),
	Eidetic = require('eidetic');

module.exports = function AuthenticationMgr(options) {

	options = options || {};
	
	var logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		statsdClient = options.statsdClient || {increment:function(){},decrement:function(){},counter:function(){},guage:function(){},timing:function(){},getChildClient:function(){return this;}},
		tokenExpiration = options.tokenExpiration || 3600000, // milliseconds until token expires
		timestampTolerance = options.timestampTolerance || 600000, // milliseconds that the timestamp from the client can differ from the server
		self = this,
		privateKeyCache = new Eidetic({ maxSize: 100, canPutWhenFull: true, logger: logger }),
		clientSvc = new ClientSvc(options),

		generateSignature = function(data, key) {
			return crypto.createHmac('sha1', key).update(data).digest('hex');
		},

		generateToken = function(name, privateKey) {
			var signature, token = '',
				now = new Date().getTime(),
				expires = now + tokenExpiration;
			
			token = token + name + ':' + now + ':' + expires;
			signature = generateSignature(token, privateKey);
			return token + ':' + signature;
		},

		generatePrivateKey = function(length) {
			return crypto.randomBytes(length).toString('hex');
		},

		getPrivateKeyByClientName = function(clientName, callback) {
			var key = privateKeyCache.get(clientName);
			if (key) {
				callback(null, key);
			}
			else {
				clientSvc.findByName(clientName, function(err, client) {
					if (err) {
						return callback(err);
					}
					if (!client) {
						return callback(new Error('Unable to find the client: ' + clientName));
					}
					privateKeyCache.put(clientName, client.privateKey, 300, true);
					callback(null, client.privateKey);
				});
			}
		},
		ensureAdminExists = function() {
			clientSvc.findAll(function(err, allClients) {
				if (err) {
					logger.error('Problem ensuring admin exists: ' + err.message);
					return;
				}
				for (var i = 0; i < allClients.length; i++) {
					if (allClients[i].isAdmin) {
						return;
					}
				}
				var client = {
					name: 'admin',
					email: 'none',
					isConfirmed: true,
					isAdmin: true,
					sharedKey: uuid.v4(),
					privateKey: generatePrivateKey(20)
				};
				clientSvc.insert(client, function(err, result) {
					if (err) {
						logger.error('Problem ensuring admin exists: ' + err.message);
						return;
					}
				});

			});
		};

	ensureAdminExists();
	statsdClient = statsdClient.getChildClient('authentication');

	this.isAdmin = function(name, callback) {
		if (!name || typeof(name) !== 'string' || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date();

		clientSvc.findByName(name, function(err, existingClient) {
			statsdClient.timing('is-admin', startTime);
			if (err || !existingClient) {
				err = err || new Error('Client does not exist');
				return callback(err);
			}
			callback(null, existingClient.isAdmin);
		});
	};

	this.addClient = function(name, email, sharedKey, isAdmin, callback) {
		if (!name || typeof(name) !== 'string' || !sharedKey || typeof(sharedKey) !== 'string' || !email || typeof(email) !== 'string' ||
			typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date(),
			client = {
				name: name.trim().toLowerCase(),
				email: email,
				isConfirmed: false,
				isAdmin: isAdmin,
				sharedKey: sharedKey.trim().toLowerCase(),
				privateKey: generatePrivateKey(20)
			};
		clientSvc.findByName(name, function(err, existingClient) {
			if (err) {
				return callback(err);
			}
			if (existingClient) {
				return callback(new Error('Conflict Error: ' + name + ' already exists in the system'));
			}
			clientSvc.insert(client, function(err, result) {
				statsdClient.timing('add-client', startTime);
				if (err) {
					return callback(err);
				}
				callback(null, result);
			});
		});
	};

	this.updateClient = function(name, email, isConfirmed, isAdmin, callback) {
		if (!name || typeof(name) !== 'string' || !email || typeof(email) !== 'string' || typeof(isConfirmed) !== 'boolean' ||
			typeof(isAdmin) !== 'boolean' || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date();
		clientSvc.findByName(name, function(err, existingClient) {
			if (err) {
				return callback(err);
			}
			if (existingClient) {
				return callback(new Error('Conflict Error: ' + name + ' already exists in the system'));
			}
			existingClient.name = name.trim().toLowerCase();
			existingClient.email = email;
			existingClient.isConfirmed = isConfirmed;
			existingClient.isAdmin = isAdmin;

			clientSvc.update(existingClient._id, existingClient, function(err, result) {
				statsdClient.timing('update-client', startTime);
				if (err) {
					return callback(err);
				}
				callback(null, result);
			});
		});
	};

	this.authenticateClient = function(name, timestamp, signature, callback) {
		if (!name || typeof(name) !== 'string' || typeof(timestamp) !== 'number' ||
			!signature || typeof(signature) !== 'string' || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		var startTime = new Date(),
			expectedSignature,
			timeDiff = Math.abs(timestamp - startTime.getTime());

		if (timeDiff > timestampTolerance) {
			return callback(new Error('Timestamp is outside the acceptable bounds'));
		}

		clientSvc.findByName(name, function(err, client) {
			
			if (err) {
				return callback(err);
			}
			if (!client) {
				return callback(new Error('Unable to find the client: name'));
			}

			expectedSignature = generateSignature(name + ':' + timestamp, client.sharedKey);
			if (signature !== expectedSignature) {
				return callback(new Error('Unable to authenticate client'));
			}

			var token = generateToken(name, client.privateKey);
			statsdClient.timing('generate-token', startTime);
			callback(null, token);

		});
	};

	this.validateToken = function(token, callback) {
		if (!token || typeof(token) !== 'string' || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date(),
			expectedSignature,
			tokenParts = token.split(':'),
			name = tokenParts[0],
			tokenTimestamp = tokenParts[1],
			tokenExpiration = tokenParts[2],
			signature = tokenParts[3];

		if (!name || !tokenTimestamp || !tokenExpiration || !signature) {
			return callback(new Error('Invalid token format'));
		}

		tokenTimestamp = parseInt(tokenTimestamp, 10);
		tokenExpiration = parseInt(tokenExpiration, 10);

		if (startTime.getTime() > tokenExpiration) {
			return callback(new Error('Token expired'));
		}

		getPrivateKeyByClientName(name, function(err, key) {
			if (err) {
				return callback(err);
			}
			expectedSignature = generateSignature(token.substr(0, token.lastIndexOf(':')), key);
			statsdClient.timing('validate-token', startTime);
			if (expectedSignature === signature) {
				callback(null, true);
			}
			else {
				callback(null, false);
			}
		});

	};
};



