var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
	Server = require('mongodb').Server,
	ObjectID = require('mongodb').ObjectID,
	ReplSetServers = require('mongodb').ReplSetServers;

module.exports = {};



module.exports.TransportFactory = function(options) {

	var logsCollection = null,
		isConnecting = false,
		callbacksInWaiting = [],
		db,
		dbHostParts,
		dbName = 'configurine',
		dbHosts = options.db.hosts || ['127.0.0.1:27017'],
		dbUser = options.db.userName || '',
		dbPass = options.db.password || '';

	if (dbHosts.length === 1) {
		dbHostParts = dbHosts[0].split(':');
		if (dbHostParts.length < 2) {
			dbHostParts.push(27017);
		}
		db = options.db.instance || new Db(dbName, new Server(dbHostParts[0], parseInt(dbHostParts[1], 10), {auto_reconnect: true, safe: true, strict: true}, {}));
	}
	else {
		var servers = [];
		for(var i =0; i< dbHosts.length; i++) {
			dbHostParts = dbHosts[i].split(':');
			if (dbHostParts.length < 2) {
				dbHostParts.push(27017);
			}
			servers.push(new Server(dbHostParts[0], parseInt(dbHostParts[1], 10), { auto_reconnect: true, safe: true, strict: true} ));
		}
		var replSet = new ReplSetServers(servers);
		db = options.db.instance || new Db(dbName, replSet);
	}

	var getLogsCollection = function (callback) {
		if (!logsCollection) {
			db.collection('logs', function getLogsCollectionHandler(err, collection) {
				logsCollection = collection;
				callback(err || null, collection);
			});
			return;
		}
		callback(null, logsCollection);
	};

	var connect = function(callback) {
		if (isConnecting) {
			callbacksInWaiting.push(callback);
		}
		else if (!db.serverConfig.isConnected()) {
			isConnecting = true;
			db.open(function(err, db) {
				if(err) {
					callbacksInWaiting.forEach(function(cb) {
						cb(err);
					});
					callbacksInWaiting = [];
					callback(err);
					isConnecting = false;
				}
				db.authenticate(dbUser, dbPass, function(err, result) {
					if(err || !result) {
						callbacksInWaiting.forEach(function(cb) {
							cb(err);
						});
						callbacksInWaiting = [];
						callback(err);
						isConnecting = false;
					}

					callbacksInWaiting.forEach(function(cb) {
						cb(null);
					});
					callbacksInWaiting = [];
					callback(null);
					isConnecting = false;
				});
					
			});
		} else {
			callback();
		}

	};

	var consoleTransport = function(data) {
		console.log(data.output);
	};

	var fileTransport = function(data) {
		var fs = require('fs');
		fs.createWriteStream('/var/log/configurine.log', {
			flags: 'a',
			encoding: 'utf8',
			mode: 666
		}).write(data.output + '\n');
	};

	var mongoTransport = function(data) {
		connect(function(error) {
			getLogsCollection(function(error, logsCollection) {
				if (error) {
					console.log('Error retrieving the log collection:', error);
					return;
				}
				logsCollection.insert({message: data.output}, function(error, count) {
					if (error) {
						console.log('Error inserting log to DB:', error);
						return;
					}
				});
			});
		});
	};

	this.getTransportFunction = function(type) {

		if (type === 'file') {
			return fileTransport;
		}
		else if (type === 'mongo') {
			return mongoTransport;
		}
		else {
			return consoleTransport;
		}
	};
};

