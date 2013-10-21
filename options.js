module.exports = {
	listenPort: {
		character: 'l',
		argument: 'port',
		defaultValue: 8088,
		type: Number,
		description: 'The port that the application will listen for incoming HTTP requests on.'
	},
	numberProcesses: {
		character: 'n',
		argument: 'number',
		defaultValue: 1,
		type: Number,
		description: '(DOES NOT WORK YET) The number of processes to use for this application.'
	},
	databaseHost: {
		character: 'o',
		argument: 'host',
		defaultValue: '127.0.0.1:27017',
		description: 'The MongoDB host that this should connect to (hostname and port). This can also be a comma-separated list of hosts to support a replica set.'
	},
	databaseUser: {
		character: 'u',
		argument: 'user',
		description: 'The user name to use when connecting to MongoDB.'
	},
	databasePassword: {
		character: 'p',
		argument: 'password',
		description: 'The password to use when connecting to MongoDB.'
	},
	logTransport: {
		character: 't',
		argument: 'type',
		defaultValue: 'none',
		description: 'The transport to use for logging. Valid options are none, console, file, and mongo. If file is chosen, logs will be written to /var/log/configurine.log (make sure you use a program like logrotate to manage your log files). If mongo is chosen, logs will be written to the configurine database in the logs collection.'
	},
	logLevel: {
		character: 'g',
		argument: 'level',
		defaultValue: 0,
		description: 'The level to log at. Can be a number 0-5 or the following strings: log, trace, debug, info, warn, and error.'
	},
	statsdHost: {
		character: 's',
		argument: 'host',
		defaultValue: '127.0.0.1:8125',
		description: 'The statsd host (hostname and port) where metrics can be sent.'
	},
	redisHost: {
		character: 'r',
		argument: 'host',
		description: 'The redis host (hostname and port) that can be used for caching. If not specified, an in-memory cache will be used'
	},
	redisPassword: {
		character: 'P',
		argument: 'string',
		defaultValue: undefined,
		description: 'The redis authentication password when required.'
	},
	secondsToCache : {
		character : 'c',
		argument : 'number',
		defaultValue : 300000,
		description : 'The length of time in which configurine will cache GET requests'
	}
};