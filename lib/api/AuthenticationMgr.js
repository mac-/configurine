var crypto = require('crypto'),
	ClientSvc = require('./ClientSvc'),
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
		};

	statsdClient = statsdClient.getChildClient('authentication');

	this.addClient = function(name, email, sharedKey, callback) {
		if (!name || typeof(name) !== 'string' || !sharedKey || typeof(sharedKey) !== 'string' || !email || typeof(email) !== 'string' ||
			!callback || typeof(callback) !== 'function') {
			throw new Error('Missing or invalid parameters');
		}
		var startTime = new Date(),
			client = {
				name: name.trim().toLowerCase(),
				email: email,
				isConfirmed: false,
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
				statsdClient.timing('add-client.system', startTime);
				if (err) {
					return callback(err);
				}
				//TODO: send email to confirm
				callback(null, result);
			});
		});
	};

	this.authenticateClient = function(name, timestamp, signature, callback) {
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

			var token = generateToken(name, client.privateKey);
			statsdClient.timing('generate-token.system', startTime);
			callback(null, token);

		});
	};

	this.validateToken = function(token, callback) {
		if (!token || typeof(token) !== 'string' || !callback || typeof(callback) !== 'function') {
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



