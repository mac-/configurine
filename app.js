var version = require('./package.json').version,
	cluster = require('cluster'),
	opter = require('opter'),
	options = require('./options.js'),
	logger,
	workers = [],
	timeouts = {},
	errorHandler = null,
	getLoggerInstance = function(transport, logLevel, dbOptions) {
		var logTransportHelper = require('./lib/helpers/LogTransport'),
			transportFactory = new logTransportHelper.TransportFactory(dbOptions),
			logTransport = transport || 'console',
			logOptions = {
				level: logLevel || 0,
				transport: transportFactory.getTransportFunction(logTransport),
				format : "[{{pid}}] {{timestamp}} <{{title}}> {{file}}:{{line}} ({{method}}) {{message}}",
				preprocess: function(data) { data.pid = process.pid; }
			},
			//loggerType = (logTransport === 'console') ? tracer.colorConsole : tracer.console,
			logger = require('tracer').console(logOptions);
		return logger;
	};
/*
if (cluster.isMaster) {

	var config = opter(options, version);

	var dbHosts = (config.databaseHost) ? config.databaseHost.split(',') : undefined,
		dbOptions = {
			db: {
				hosts: dbHosts,
				userName: config.databaseUser,
				password: config.databasePassword
			}
		};
	
	logger = getLoggerInstance(config.logTransport, config.logLevel, dbOptions);


	// set up workers
	for (i = 0; i < config.numberProcesses; i++) {
		workers.push(cluster.fork(config));
	}

	cluster.on('fork', function(worker) {
		timeouts[worker.id] = setTimeout(function() {
			logger.log('worker timed out');
			worker.destroy();
			workers.splice(workers.indexOf(worker), 1);
			workers.push(cluster.fork(config));
		}, 5000);
	});
	cluster.on('disconnect', function(worker) {
		timeouts[worker.id] = setTimeout(function() {
			logger.log('worker timed out');
			worker.destroy();
			workers.splice(workers.indexOf(worker), 1);
			workers.push(cluster.fork(config));
		}, 5000);
	});
	cluster.on('listening', function(worker, address) {
		logger.log("A worker is now connected to " + address.address + ":" + address.port);
		clearTimeout(timeouts[worker.id]);
	});
	cluster.on('exit', function(worker, code, signal) {
		clearTimeout(timeouts[worker.id]);
		var exitCode = worker.process.exitCode;
		logger.log('worker ' + worker.process.pid + ' died ('+exitCode+'). restarting...');
		workers.splice(workers.indexOf(worker), 1);
		workers.push(cluster.fork(config));
	});

	errorHandler = function(evt, err) {
		logger.error('Event:', evt, 'Error:', err);
		workers.forEach(function(worker) {
			worker.destroy();
			workers.splice(workers.indexOf(worker), 1);
		});
		process.exit(1);
	};
}
else {*/
	// TODO: add instrumentation

	var Hapi = require('hapi'),
		_ = require('underscore'),
		dbHosts = (process.env.databaseHost) ? process.env.databaseHost.split(',') : undefined,
		options = {
			db: {
				hosts: dbHosts,
				userName: process.env.databaseUser,
				password: process.env.databasePassword
			},
			maxCacheSize: process.env.maxCacheSize,
			secondsToCache: process.env.secondsToCache
		};

	options.logger = logger = getLoggerInstance(process.env.logTransport, process.env.logLevel, options);

	var ConfigController = require('./lib/ConfigController'),
		controller = new ConfigController(options),
		listenPort = process.env.listenPort || 8088,
		server = Hapi.createServer(listenPort);

	server.route(controller.routes);

	errorHandler = function(evt, err) {
		if (err) {
			logger.error('Event:', evt, 'Error:', err.stack);
		}
		else {
			logger.error('Event:', evt);
		}
		server.stop(function() {
			process.exit(1);
		});
		
	};

	
	server.start(function() {
		logger.log('Server started at:', server.info.uri);
	});
//}


process.on('uncaughtException', function(err) { errorHandler('uncaughtException', err); });
process.on('SIGTERM', function(err) { errorHandler('SIGTERM'); });
process.on('SIGINT', function(err) { errorHandler('SIGINT'); });
process.on('SIGQUIT', function(err) { errorHandler('SIGQUIT'); });
