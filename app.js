var version = require('./package.json').version,
	cluster = require('cluster'),
	opter = require('opter'),
	options = require('./options'),
	AuthHelper = require('./lib/helpers/Authentication'),
	StatsdClient = require('statsd-client'),
	statsdClient,
	logger,
	workers = [],
	timeouts = {},
	errorHandler = null,
	getStatsdInstance = function(hostname, port) {
		var statsdClient = new StatsdClient({
			host: hostname,
			port: port,
			prefix: require('./package.json').name
		});

		return statsdClient;
	},
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

/*if (cluster.isMaster) {
*/
	var config = opter(options, version);
/*
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
		logger.log('worker forked');
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
		console.log(worker);
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
	var Hapi = require('hapi'),
		pack = new Hapi.Pack(),
		_ = require('underscore'),
		//config = process.env,
		dbHosts = (config.databaseHost) ? config.databaseHost.split(',') : undefined,
		options = {
			db: {
				hosts: dbHosts,
				userName: config.databaseUser,
				password: config.databasePassword
			},
			maxCacheSize: config.maxCacheSize,
			secondsToCache: config.secondsToCache
		};

	options.logger = logger = getLoggerInstance(config.logTransport, config.logLevel, options);
	options.statsdClient = statsdClient = (config.hasOwnProperty('host')) ?
							getStatsdInstance(config.host.split(':')[0], config.host.split(':')[1]) :
							{increment:function(){},decrement:function(){},counter:function(){},guage:function(){},timing:function(){},getChildClient:function(){return this;}};

	var ConfigController = require('./lib/ConfigController'),
		configController = new ConfigController(options),
		AuthenticationController = require('./lib/AuthenticationController'),
		authController = new AuthenticationController(options),
		ClientController = require('./lib/ClientController'),
		clientController = new ClientController(options),
		listenPort = config.listenPort || 8088,
		server = Hapi.createServer(listenPort),
		authHelper = new AuthHelper(options),
		startTimesFromRequestId = {},
		isStarted = false,
		normalizePath = function(path) {
			path = (path.indexOf('/') === 0) ? path.substr(1) : path;
			return path.replace(/\//g, '-');
		};

	
	
	// this doesn't work yet
	//pack.require(['furball', 'lout']);

	// register auth mechanism (before registering routes)
	server.auth('oauth2', { implementation: authHelper });


	server.route(configController.routes);
	server.route(authController.routes);
	server.route(clientController.routes);


	server.ext('onRequest', function (request, next) {
		startTimesFromRequestId[request.id] = new Date();
		next();
	});

	server.ext('onPreResponse', function (request, next) {
		var statusCode = request.response()._code || request.response().response.code || 'unknown';
		statsdClient.increment(request.method + '_' + normalizePath(request.path) + '.statusCode.' + statusCode);
		statsdClient.increment(request.method + '_' + normalizePath(request.path));
		statsdClient.timing(request.method + '_' + normalizePath(request.path), startTimesFromRequestId[request.id]);
		next();
	});

	errorHandler = function(evt, err) {
		if (err) {
			statsdClient.increment('uncaught-exception');
			logger.error('Event:', evt, 'Error:', err.stack);
		}
		else {
			statsdClient.increment('system-event');
			logger.error('Event:', evt);
		}
		if (isStarted) {
			server.stop(function() {
				process.exit(1);
			});
		}
		else {
			process.exit(1);
		}
	};

	server.start(function() {
		isStarted = true;
		logger.log('Server started at:', server.info.uri);
	});
//}


process.on('uncaughtException', function(err) { errorHandler('uncaughtException', err); });
process.on('SIGTERM', function(err) { errorHandler('SIGTERM'); });
process.on('SIGINT', function(err) { errorHandler('SIGINT'); });
process.on('SIGQUIT', function(err) { errorHandler('SIGQUIT'); });
