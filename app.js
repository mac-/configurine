var commander = require('commander'),
	version = require('./package.json').version,
	cluster = require('cluster'),
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

if (cluster.isMaster) {

	commander
		.version(version)
		.usage('[options] <file ...>');

	var config = {},
		optName,
		description,
		dashRegex = /-\w/gi,
		applicationOptions = [
			{ shortOption: 'l', longOption: 'listen-port', longOptionArgument: 'port', defaultValue: 8088, description: 'The port that the application will listen for incoming HTTP requests on.' },
			{ shortOption: 'n', longOption: 'number-processes', longOptionArgument: 'number', defaultValue: 1, description: 'The number of processes to use for this application.' },
			{ shortOption: 'o', longOption: 'database-host', longOptionArgument: 'host', defaultValue: '127.0.0.1:27017', description: 'The MongoDB host that this should connect to (hostname and port). This can also be a comma-separated list of hosts to support a replica set.' },
			{ shortOption: 'u', longOption: 'database-user', longOptionArgument: 'user', defaultValue: '', description: 'The user name to use when connecting to MongoDB.' },
			{ shortOption: 'p', longOption: 'database-password', longOptionArgument: 'password', defaultValue: '', description: 'The password to use when connecting to MongoDB.' },
			{ shortOption: 'm', longOption: 'max-cache-size', longOptionArgument: 'size', defaultValue: 500, description: 'The number of config entries to cache on the server (in memory).' },
			{ shortOption: 's', longOption: 'seconds-to-cache', longOptionArgument: 'number', defaultValue: 120, description: 'The number of seconds to cache config entries.' },
			{ shortOption: 't', longOption: 'log-transport', longOptionArgument: 'type', defaultValue: 'none', description: 'The transport to use for logging. Valid options are none, console, file, and mongo. If file is chosen, logs will be written to /var/log/configurine.log (make sure you use a program like logrotate to manage your log files). If mongo is chosen, logs will be written to the configurine database in the logs collection.' },
			{ shortOption: 'g', longOption: 'log-level', longOptionArgument: 'level', defaultValue: 0, description: 'The level to log at. Can be a number 0-5 or the following strings: log, trace, debug, info, warn, and error.' }
		];

	// apply options to command line
	applicationOptions.forEach(function(option) {
		description = option.description
		if (option.hasOwnProperty('defaultValue') && option.defaultValue !== null) {
			description += ' Defaults to: ';
			description += (typeof(option.defaultValue) === 'string') ? '"' + option.defaultValue + '"' : option.defaultValue;
		}
		var longOptionStr = (option.longOptionArgument) ? option.longOption + ' <' + option.longOptionArgument + '>' : option.longOption;
		commander.option('-' + option.shortOption + ', --' + longOptionStr, description);
	});

	// parse options form arguments
	commander.parse(process.argv);

	// save options to config obj (from env vars first, command line second, and defaults last)
	applicationOptions.forEach(function(option) {
		optName = option.longOption;
		option.longOption.match(dashRegex).forEach(function(match) {
			optName = optName.replace(match, match[1].toUpperCase());
		});
		config[optName] = process.env[optName] || commander[optName] || option.defaultValue;
	});

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
	for (i =0; i < config.numberProcesses; i++) {
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
else {
	// TODO: add instrumentation

	var restify = require('restify'),
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

	var Controller = require('./lib/Controller'),
		controller = new Controller(options),
		listenPort = process.env.listenPort || 8088,
		server = restify.createServer({
			name: 'configurine',
			version: version
		});

	errorHandler = function(evt, err) {
		logger.error('Event:', evt, 'Error:', err);
		server.close();
		process.exit(1);
	};

	logger.log('Initializing Controller');
	controller.initializeRoutes(server);

	logger.log('Listening on port: ', listenPort);
	server.listen(listenPort);
}


process.on('uncaughtException', function(err) { errorHandler('uncaughtException', err); });
process.on('SIGTERM', function(err) { errorHandler('SIGTERM'); });
process.on('SIGINT', function(err) { errorHandler('SIGINT'); });
process.on('SIGQUIT', function(err) { errorHandler('SIGQUIT'); });
