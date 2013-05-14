var crypto = require('crypto'),
	bcrypt = require('bcrypt'),
	ClientSvc = require('./ClientSvc'),
	Eidetic = require('eidetic');

module.exports = function AuthenticationMgr(options) {

	options = options || {};
	
	var logger = options.logger || {log:function(){},trace:function(){},debug:function(){},info:function(){},warn:function(){},error:function(){}},
		tokenExpiration = options.tokenExpiration || 3600, // seconds until token expires
		timestampTolerance = options.timestampTolerance || 600, // seconds that the timestamp from the client can differ from the server
		self = this,
		//TODO: cache private keys
		privateKeyCache = new Eidetic({ maxSize: 100, canPutWhenFull: true, logger: logger }),
		clientSvc = new ClientSvc(options),

		generateSignature = function(data, key) {
			return crypto.createHmac('sha1', key).update(data).digest('hex');
		},

		generateToken = function(type, name, privateKey) {
			var signature, token = type + ':',
				now = Math.round(new Date().getTime() / 1000),
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

	this.addSystemClient = function(name, sharedKey, applications, callback) {
		if (!name || typeof(name) !== 'string' || !sharedKey || typeof(sharedKey) !== 'string' ||
			!applications || typeof(applications) !== 'object' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var client = {
			name: name.trim().toLowerCase(),
			type: 'system',
			sharedKey: sharedKey.trim().toLowerCase(),
			privateKey: generatePrivateKey(20),
			applications: applications.slice(0)
		};
		clientSvc.insert(client, function(err, result) {
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

	this.authenticateSystemClient = function(name, sharedKey, timestamp, signature, callback) {
		if (!name || typeof(name) !== 'string' || !sharedKey || typeof(sharedKey) !== 'string' ||
			!timestamp || typeof(timestamp) !== 'object' || !signature || typeof(signature) !== 'string' ||
			!callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		var expectedSignature, now = Math.round(new Date().getTime / 1000),
			timeDiff = Math.abs(timestamp - now);

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

			return generateToken('system', name, client.privateKey);

		});
	};

	this.authenticateUserClient = function(name, password, timestamp, callback) {
		if (!name || typeof(name) !== 'string' || !password || typeof(password) !== 'string' ||
			!timestamp || typeof(timestamp) !== 'number' || !callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}

		var now = Math.round(new Date().getTime / 1000),
			timeDiff = Math.abs(timestamp - now);

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
			console.log(password, client);
			bcrypt.compare(password, client.password, function(err, result) {
				if (err) {
					return callback(new Error('Unable to verify client'));
				}
				if (result) {
					callback(null, generateToken('user', name, client.privateKey));
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
		var expectedSignature,
			now = Math.round(new Date().getTime / 1000),
			tokenParts = token.split(':'),
			type = tokenParts[0],
			name = tokenParts[1],
			tokenTimestamp = tokenParts[2],
			tokenExpiration = tokenParts[3],
			signature = tokenParts[4];

		if (!name || !tokenTimestamp || !tokenExpiration || !signature) {
			return callback(new Error('Invalid Token'));
		}

		tokenTimestamp = parseInt(tokenTimestamp, 10);
		tokenExpiration = parseInt(tokenExpiration, 10);

		if (now > tokenExpiration) {
			return callback(new Error('Token Expired'));
		}

		clientSvc.findByName(name, function(err, client) {
			if (err) {
				return callback(err);
			}
			if (!client) {
				return callback(new Error('Unable to find the client: name'));
			}
			expectedSignature = generateSignature(token.substr(0, token.lastIndexOf(':')), client.privateKey);
			if (expectedSignature === signature) {
				callback(null, true);
			}
			else {
				callback(null, false);
			}
		});

	};
};



