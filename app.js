var commander = require('commander'),
	version = require('./package.json').version;

commander
	.version(version)
	.usage('[options] <file ...>')
	.option('-l, --listen-port <port>', 'The port that the application will listen for incoming HTTP requests on. Defaults to 8088.')
	.option('-n, --number-processes <number>', 'The number of processes to use for this application. Default is 1.')
	.option('-o, --database-host <host>', 'The MongoDB host that this should connect to (hostname and port). This can also be a comma-separated list of hosts to support a replica set. Defaults to 127.0.0.1:27017.')
	.option('-u, --database-user <user>', 'The user name to use when connecting to MongoDB. Defaults to an empty string.')
	.option('-p, --database-password <password>', 'The password to use when connecting to MongoDB. Defaults to an empty string.')
	.option('-m, --max-cache-size <size>', 'The number of config entries to cache on the server (in memory). Defaults to 500.')
	.option('-s, --seconds-to-cache <number>', 'The number of seconds to cache config entries. Defaults to 120.')
	.option('-t, --log-transport <type>', 'The transport to use for logging. Valid options are console, file, and mongo. If file is chosen, logs will be written to /var/log/conman.log (make sure you use a program like logrotate to manage your log files). If mongo is chosen, logs will be written to the conman database in the logs collection. Default is console.')
	.option('-g, --log-level <level>', 'The level to log at. Can be a number 0-5 or the following strings: log, trace, debug, info, warn, and error. Default is 0.')
	.parse(process.argv);

// TODO: set up to use cluster
// TODO: add logging
// TODO: add performance logging

var restify = require('restify'),
	tracer = require('tracer'),
	logTransportHelper = require('./lib/helpers/LogTransport'),
	dbHosts = (commander.databaseHost) ? commander.databaseHost.split(',') : undefined;
	options = {
		db: {
			hosts: dbHosts,
			userName: commander.databaseUser,
			password: commander.databasePassword
		},
		maxCacheSize: commander.maxCacheSize,
		secondsToCache: commander.secondsToCache
	},
	transportFactory = new logTransportHelper.TransportFactory(options),
	logLevel = commander.logLevel || 0,
	logTransport = commander.logTransport || 'console',
	logOptions = {
		level: logLevel,
		transport: transportFactory.getTransportFunction(logTransport)
	},
	//loggerType = (logTransport === 'console') ? tracer.colorConsole : tracer.console,
	logger = tracer.console(logOptions);

options.logger = logger;

var Controller = require('./lib/Controller'),
	controller = new Controller(options),
	listenPort = commander.listenPort || 8088,
	server = restify.createServer({
		name: 'conman',
		version: version
	});

logger.log('Initializing Controller');
controller.initializeRoutes(server);

logger.log('Listening on port: ', listenPort);
server.listen(listenPort);
