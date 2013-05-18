configurine [![Build Status](https://secure.travis-ci.org/mac-/configurine.png)](http://travis-ci.org/mac-/configurine)
===

Configurine is a Node JS application that provides a REST interface for managing and retrieving config values. Configurine currently uses MongoDB for storing config values, and provides a RESTful API for retrieving values from the DB. The system allows you to "associate" your config values to either environments or applications, or both.

For example, you could have two config values named "myConfig", and each one is associated to a different environment (development/production) or to a different application (myapp-v1/myapp-v2).

This centralized system provides an easy mechanism for using application-specific or environment-specific config for all of your applications, regardless of what technology they are using.

Goals
===
* should be available to both client and server apps
* should be able to act as a centralized system
* should be easy to add/change values (REST interface)
* should allow multiple values with the same name
* management of config can be automated with scripts or through a nice GUI

The Design
===

Config Entries
---

Config documents will mainly be accessed by name. A config document consists of the following properties:

* name: The name of the config entry that comsumers will request values by
* value: The value of the config entry that contains the data necessary for consumers
* tags: A collection of tags that describe the config entry
* isActive: A flag that marks whether or not this config entry is available to consumers
* isSensitive: A flag that marks whether or not this config entry requires authentication in order to be available to conumers

Tagging
---

The tagging system is probably the most important part of the application. Configurine comes with a script that will create a set of default tag types. But you could set up your own tag types as you see fit. The default tag types are: "environment", "machine", and "application". The tagging system has a priority system and each tag type has it's own "weight". This allows us to have multiple config entries with the same name, but can be used in different circumstances.When requesting a config entry by name, you'll also supply a list of tags that correspond to the given situation. For example, let's say you have an entry called "loglevel" and in your development environment you want it set to "debug", but in production you want it set to "error". You would create two different entries in the system, but tag one with the "environment" tag of "development" and the other with "production". You're application would then just have to make a request to get config and pass along the name of the environment, and Configurine will provide the corresponding config value. 

The algorithm that Configurine uses to determine the best config value works as follows:

* Find all config documents in the DB with the desired name
* Assign a total score to each document by adding up the priorities of each matching tag
* A config document is removed from the collection of possibilities if it contains a value of a given tag type that is different than the one being requested
	* For example, if we want a config entry tagged with of environment: production, but there is one with the same name that has a tag of environment: development, it is removed from the possibilities. But if there is one with the same name and it does NOT contain any environment type tag, then it is still in the running.
* Respond back with the value of the config document with the highest score.

Tagging Notes
---

* the tag types must have a priority that is a power of 2 AND is unique to prevent more than one config entry matching a given set of conditions.
* your application should ALWAYS provides values for each tag type that you have in Configurine, otherwise it may not be able to always determine the desired value.

The Database
---

There are four Mongo collections used in Confgurine that are required. The first collection is called "config" and stores the actual config values. The second is called "configUsers" and stores the credentials of users who can manage the system. The last collection is called "configTagTypes" and contains all the available tag types and thier priorities. The fourth collection is called "history" and stores a history of each change to a given config document. There is one last optional collection called "logs" if you choose to write your logs to Mongo.


Installation
===

You'll need:

* a non-windows machine that has [Node](http://nodejs.org/) installed in order to run the application.
* a MongoDB instance

Pull down the source code and run the tests to make sure everything you are in a good state:

	$ git clone git@github.com:mac-/configurine.git
	$ cd configurine
	$ make install
	$ make test



Running the Tests
===

Configurine comes with a set of unit tests, and a set of automated integration tests. To run the unit tests run the following command:

	$ make test

To run the integration tests, you'll need a Mongo DB instance set up since the test invokes the application, and change the values in tests/integrationTestConfig.json to match your setup. Then you can run the tests with the following command:

	$ make integration

Running the App
===

You can run configurine with the -h flag to see the various options:

	$ node app.js -h
	  Usage: app.js [options]

	  Options:

	    -h, --help                          output usage information
	    -V, --version                       output the version number
	    -l, --listen-port <port>            The port that the application will listen for incoming HTTP requests on. Defaults to: 8088
	    -n, --number-processes <number>     The number of processes to use for this application. Defaults to: 1
	    -o, --database-host <host>          The MongoDB host that this should connect to (hostname and port). This can also be a comma-separated list of hosts to support a replica set. Defaults to: "127.0.0.1:27017"
	    -u, --database-user <user>          The user name to use when connecting to MongoDB.
	    -p, --database-password <password>  The password to use when connecting to MongoDB.
	    -t, --log-transport <type>          The transport to use for logging. Valid options are none, console, file, and mongo. If file is chosen, logs will be written to /var/log/configurine.log (make sure you use a program like logrotate to manage your log files). If mongo is chosen, logs will be written to the configurine database in the logs collection. Defaults to: "none"
	    -g, --log-level <level>             The level to log at. Can be a number 0-5 or the following strings: log, trace, debug, info, warn, and error. Defaults to: 0
	    -s, --statsd-host <host>            The statsd host (hostname and port) where metrics can be sent. Defaults to: "127.0.0.1:8125"



Example usage:

	$ node app.js -o my.mongo.instance:27017 -u admin -p password

You may also specify values for the options in env variables. The format of the option name is camelcase with dashes removed (so "log-level" would be "logLevel"). If a value is specified in both env vars and the command line args, the env vars value will take precedence.

Using the App
===

Main API
---

The main end point that your applications will be using is:

	GET /config

This rend point, by itself, will return all config entries in the system. To filter the result to something more managable, ther are a few query string parameters that you can specify:

	* ```names```
		* The ```names``` query string parameter will filter the result to only include config entries with the names you specify
		* Example: ```GET /config?names=statsd&names=loglevel``` will return results that have the name "statsd" OR "loglevel"
	* ```associations```
		* The ```associations``` query string parameter will filter the result to only include config entries with the associations you specify
		* Application associations are specified in the format of ```application|<appName>|<appVersion>```
		* Environment associations are specified in the format of ```environment|<envName>```
		* Example: ```GET /config?associations=environment|production&associations=application|myapp|1.0.0``` will return results that have an association to the application named "myapp" whose version is "1.0.0" OR an environment named "production"
	* ```isActive```
		* the ```isActive``` query string parameter will filter the result to only include config entries that have the ```isActive``` flag set to the specifed boolean value
		* Example: ```GET /config?isActive=true``` will return results that have the ```isActive``` property set to true

It is also possible to mix and match these parameters as you see fit to get the result you want. It is possible that the results of these requests to contain config entries with the same name. Therefore it is up to the consumer to provide the logic for parsing out the values that their application should consume. For example, A request to ```GET /config?names=loglevel``` could return the following result:

	[{
		"name": "loglevel",
		"value": "error",
		"associations": {
			"applications": [{
				"name": "myapp",
				"version": "1.0.0"
			}],
			environments: []
		},
		isSensitive: false,
		isActive: true
	}, {
		"name": "loglevel",
		"value": "info",
		"associations": {
			"applications": [{
				"name": "myapp",
				"version": "2.0.0"
			}],
			environments: []
		},
		isSensitive: false,
		isActive: true
	}]

As you can see, there are multiple values for the config entry named "loglevel". Therefore it is up to the application to decide which one to use. In this case, if my application is named "myapp", then I may want to just change the GET request to incorporate the query string parameter for associations to narrow down the results so that my application doesn't have to do as much work to determine which value to use. For example, I could change the request to ```GET /config?names=loglevel&associations=application|myapp|2.0.0``` to narrow the result down to one entry.


Authentication
===

These routes require [basic authentication](http://en.wikipedia.org/wiki/Basic_access_authentication). So an example curl request might look like:

	$ curl -u user:user 'http://127.0.0.1:8088/configEntries/502fd3839702c7f81e000001'


License
===
The MIT License (MIT) Copyright (c) 2012 Mac Angell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
