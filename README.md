configurine
===

Configurine is a Node JS application that provides a REST interface for managing and retrieving config values. Configurine currently uses MongoDB for storing config values, and provides a RESTful API for retrieving values from the DB. The system allows you to "tag" your config with specific properties so that you can have multiple config values with the same name, but they'll get used differently depending on the situation (applications/environments/machines).

For example, you could have two config values named "myConfig", and tag each one with a different environment (development/production) or with a different machine name (prod01/prod02).

This centralized system provides an easy mechanism for using application-specific, environment-specific, and machine-specific config for all of your applications, regardless of what technology they are using.

Goals
===
* should be available to both client and server apps
* should be centralized
* should be easy to add/change values (REST interface)
* should allow multiple values with the same name but different tags to support app/env/machine-specific overrides
* should be fast and cache values when possible
* should be able to work with multiple programming languages
* should track changes to config values (history)
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

Config Entry History
---

Every change to a config entry will result in a new document in the "history" collection. You'll then be able to revert config documents to a previous state based on the documents in this collection.


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

If you'd like to get the default setup up and running (recommended), you'll want to run the following:

	$ ./scripts/CreateDefaultSetup -o <your.mongo.host:port> -u <your.mongo.user.name> -p <your.mongo.user.password>

This script will create the following config users and tag types:

* Users (username/password):
	* admin/admin
	* editor/editor
	* user/user
* Tag Types (name/priority):
	* environment/1
	* machine/2
	* application/4

Running the App
===

You can run configurine with the -h flag to see the various options:

	$ node app.js -h
	  Options:

	    -h, --help                          output usage information
	    -V, --version                       output the version number
	    -l, --listen-port <port>            The port that the application will listen for incoming HTTP requests on. Defaults to 8088.
	    -n, --number-processes <number>     The number of processes to use for this application. Default is 1.
	    -o, --database-host <host>          The MongoDB host that this should connect to (hostname and port). This can also be a comma-separated list of hosts to support a replica set. Defaults to 127.0.0.1:27017.
	    -u, --database-user <user>          The user name to use when connecting to MongoDB. Defaults to an empty string.
	    -p, --database-password <password>  The password to use when connecting to MongoDB. Defaults to an empty string.
	    -m, --max-cache-size <size>         The number of config entries to cache on the server (in memory). Defaults to 500.
	    -s, --seconds-to-cache <number>     The number of seconds to cache config entries. Defaults to 120.
	    -t, --log-transport <type>          The transport to use for logging. Valid options are console, file, and mongo. If file is chosen, logs will be written to /var/log/configurine.log (make sure you use a program like logrotate to manage your log files). If mongo is chosen, logs will be written to the configurine database in the logs collection. Default is console.
	    -g, --log-level <level>             The level to log at. Can be a number 0-5 or the following strings: log, trace, debug, info, warn, and error. Default is 0.

Example usage:

	$ node app.js -o my.mongo.instance:27017 -u admin -p password

Using the App
===

Main API
---

The main end point that your applications will be using is:

	GET /config?name={name}&tags={tags}

where {name} is the name of the config entry and {tags} is the collection of tags to use for determining the highest priority config value in the format of:

	<tag_type_1>:<tag_value_1>;<tag_type_2>:<tag_value_2>;<tag_type_n>:<tag_value_n>;

So an example (url-encoded) curl request might look like:

	$ curl 'http://127.0.0.1:8088/config?name=loglevel&tags=environment%3Aproduction%3Bmachine%3Amymachinename%3Bapplication%3AmyApp-v1'


Secondary API
---

The following end points will be available for managing config entries:

	GET /configEntries/{id}

	POST /configEntries

		{
			name: {name},
			value: {value},
			tags: [
				{
					type: {tageType},
					value: {tagValue}
				}
			],
			isSensitive: {trueOrFalse},
			isActive: {trueOrFalse}
		}

	PUT /configEntries/{id}

		{
			name: {name},
			value: {value},
			tags: [
				{
					type: {tageType},
					value: {tagValue}
				}
			],
			isSensitive: {trueOrFalse},
			isActive: {trueOrFalse}
		}

	DELETE /configEntries/{id}

These routes require (basic authentication)[http://en.wikipedia.org/wiki/Basic_access_authentication]. So an example curl request might look like:

	$ curl -u user:user 'http://127.0.0.1:8088/configEntries/502fd3839702c7f81e000001'


The following end points will be available for managing config users:

	COMING SOON...

The following end points will be available for managing config tag types:

	COMING SOON...

The following end points will be available for managing config history:

	COMING SOON...


License
===
The MIT License (MIT) Copyright (c) 2012 Mac Angell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
