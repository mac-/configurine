var crypto = require('crypto'),
	bcrypt = require('bcrypt'),
	ClientSvc = require('./ClientSvc'),
	Eidetic = require('eidetic');

module.exports = function AuthenticationMgr(options) {

	options = options || {};
	
	var logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		statsdClient = options.statsdClient || {increment:function(){},decrement:function(){},counter:function(){},guage:function(){},timing:function(){},getChildClient:function(){return this;}},
		tokenExpiration = options.tokenExpiration || 3600000, // milliseconds until token expires
		timestampTolerance = options.timestampTolerance || 600000, // milliseconds that the timestamp from the client can differ from the server
		self = this,
		//TODO: cache private keys
		privateKeyCache = new Eidetic({ maxSize: 100, canPutWhenFull: true, logger: logger }),
		clientSvc = new ClientSvc(options),

		generateSignature = function(data, key) {
			return crypto.createHmac('sha1', key).update(data).digest('hex');
		},

		generateToken = function(type, name, privateKey) {
			var signature, token = type + ':',
				now = new Date().getTime(),
				expires = now + tokenExpiration;
			if (type !== 'system' && type !== 'user') {
				throw new Error('Unable to generate token for client type: ' + type);
			}
			
			token = token + name + ':' + now + ':' + expires;
			signature = generateSignature(token, privateKey);
			return token + ':' + signature;
		},

		generatePrivateKey = function(length) {
			return crypto.randomBytes(length).toString('hex');
		};

	statsdClient = statsdClient.getChildClient('authentication');

	this.addSystemClient = function(name, sharedKey, applications, callback) {
		if (!name || typeof(name) !== 'string' || !sharedKey || typeof(sharedKey) !== 'string' ||
			!applications || typeof(applications) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date(),
			client = {
				name: name.trim().toLowerCase(),
				type: 'system',
				sharedKey: sharedKey.trim().toLowerCase(),
				privateKey: generatePrivateKey(20),
				applications: applications.slice(0)
			};
		clientSvc.insert(client, function(err, result) {
			statsdClient.timing('add-client.system', startTime);
			if (err) {
				return callback(err);
			}
			callback(null, result);
		});
	};

	this.addUserClient = function(name, password, applications, callback) {
		if (!name || typeof(name) !== 'string' || !password || typeof(password) !== 'string' ||
			!applications || typeof(applications) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date();
		bcrypt.genSalt(10, function(err, salt) {
			if (err) {
				return callback(err);
			}
			bcrypt.hash(password, salt, function(err, hashedPassword) {
				if (err) {
					return callback(err);
				}
				var client = {
						name: name.trim().toLowerCase(),
						type: 'user',
						password: hashedPassword,
						privateKey: generatePrivateKey(20),
						applications: applications.slice(0)
					};
				clientSvc.insert(client, function(err, result) {
					statsdClient.timing('add-client.user', startTime);
					if (err) {
						return callback(err);
					}
					callback(null, result);
				});
			});
		});
		
	};

	this.changeUserPassword = function(name, password, callback) {
		callback(new Error('Not Implemented Yet'));
	};

	this.authenticateSystemClient = function(name, timestamp, signature, callback) {
		if (!name || typeof(name) !== 'string' || !timestamp || typeof(timestamp) !== 'number' ||
			!signature || typeof(signature) !== 'string' || !callback || typeof(callback) !== 'function') {
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

			var token = generateToken('system', name, client.privateKey);
			statsdClient.timing('generate-token.system', startTime);
			callback(null, token);

		});
	};

	this.authenticateUserClient = function(name, password, timestamp, callback) {
		if (!name || typeof(name) !== 'string' || !password || typeof(password) !== 'string' ||
			!timestamp || typeof(timestamp) !== 'number' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		var startTime = new Date(),
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
			
			bcrypt.compare(password, client.password, function(err, result) {
				if (err) {
					return callback(new Error('Unable to verify client'));
				}
				if (result) {
					var token = generateToken('user', name, client.privateKey);
					statsdClient.timing('generate-token.user', startTime);
					callback(null, token);
				}
				else {
					callback(new Error('Unable to authenticate client'));
				}
			});
		});
	};

	this.validateToken = function(token, callback) {
		if (!token || typeof(token) !== 'string' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date(),
			expectedSignature,
			tokenParts = token.split(':'),
			type = tokenParts[0],
			name = tokenParts[1],
			tokenTimestamp = tokenParts[2],
			tokenExpiration = tokenParts[3],
			signature = tokenParts[4];

		if (!name || !tokenTimestamp || !tokenExpiration || !signature) {
			return callback(new Error('Invalid token format'));
		}

		tokenTimestamp = parseInt(tokenTimestamp, 10);
		tokenExpiration = parseInt(tokenExpiration, 10);

		if (startTime.getTime() > tokenExpiration) {
			return callback(new Error('Token expired'));
		}

		clientSvc.findByName(name, function(err, client) {
			if (err) {
				return callback(err);
			}
			if (!client) {
				return callback(new Error('Unable to find the client: ' + name));
			}
			expectedSignature = generateSignature(token.substr(0, token.lastIndexOf(':')), client.privateKey);
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



