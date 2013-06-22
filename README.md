# configurine


[![Build Status](https://secure.travis-ci.org/mac-/configurine.png)](http://travis-ci.org/mac-/configurine)
[![Dependency Status](https://david-dm.org/mac-/configurine.png)](https://david-dm.org/mac-/configurine)

Configurine is a Node JS application that provides a REST interface for managing and retrieving config values. Configurine currently uses MongoDB for storing config values, and provides a RESTful API for retrieving values from the DB. The system allows you to "associate" your config values to either environments or applications, or both.

For example, you could have two config values named "myConfig", and each one is associated to a different environment (development/production) or to a different application (myapp-v1/myapp-v2).

This centralized system provides an easy mechanism for using application-specific or environment-specific config for all of your applications, regardless of what technology they are using.

* [Goals](#goals)
* [Installation](#installation)
* [Running the Tests](#running-the-tests)
* [Running the App](#running-the-app)
* [Using the App](#using-the-app)
	* [Authentication](#authentication)
		* [Getting an Auth Token](#getting-an-auth-token)
		* [Getting a Shared Key](#getting-a-shared-key)
	* [Config API](#config-api)
		* [GET /config](#get-config)
		* [POST /config](#post-config)
		* [GET /config/{id}](#get-configid)
		* [PUT /config/{id}](#put-configid)
		* [DELETE /config/{id}](#delete-configid)
* [License](#license)

# Goals

* should be available to both client and server apps
* should be able to act as a centralized system
* should be easy to add/change values (REST interface)
* should allow multiple values with the same name
* management of config can be automated with scripts or through a nice GUI

# Installation

You'll need:

* a non-windows machine that has [Node](http://nodejs.org/) installed in order to run the application.
* a MongoDB instance

Pull down the source code and run the tests to make sure everything you are in a good state:

	$ git clone git@github.com:mac-/configurine.git
	$ cd configurine
	$ make install
	$ make test



# Running the Tests

Configurine comes with a set of unit tests, and a set of automated integration tests. To run the unit tests run the following command:

	$ make test

To run the integration tests, you'll need a Mongo DB instance set up since the test invokes the application, and change the values in tests/integrationTestConfig.json to match your setup. Then you can run the tests with the following command:

	$ make integration

# Running the App

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

You may also specify values for the options in environment variables or in a JSON file called `opter.json` at the root of the project. The format of the option name is camelcase with dashes removed (so "log-level" would be "logLevel"). The order of precedence is as follows:

1. command line args
2. environment variables
3. opter.json file
4. default value

# Using the App

## Authentication

Almost all requests made to the config routes require you to be authenticated. Configurine looks for the presence of the `Authorization` request header and attempts to authenticate the request based on the value of that `Authorzation` header, also called an auth token.

### Getting an Auth Token

A token can be acquired by issuing a POST request to the `/token` end point. The post body should contain the following information:

* `grant_type` - the type of grant that is being requested. In this case it will be: `client_credentials`
* `client_id` - the ID of the client to get a token for
* `timestamp` - the number of milliseconds since 00:00 January 1st, 1970
* `signature` - a sha1 HMAC of the client_id and timestamp joined with a `:` character and hashed with the client's shared key

Here's an example request:

```
POST http://localhost:8088/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=myclient&timestamp=1371666450772&signature=5f794da2837c18919f1b8791f21238b7a64acf30
```

And the response might look like:

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"access_token":"myclient:1371666627113:1371670227113:47a8cdf5560706874688726cb1b3e843783c0811"}
```

Here is some sample JS (NodeJS) code to generate the signature for the above request:

```javascript
var crypto = require('crypto');
var clientId = 'myclient';
var sharedKey = 'a1c1f962-bc57-4109-8d49-bee9f562b321';
var timestamp = 1371666450772;
var signature = crypto.createHmac('sha1', sharedKey).update(clientId + ':' + timestamp).digest('hex'); //5f794da2837c18919f1b8791f21238b7a64acf30
```

**Notes:**

* The shared key is a UUID that gets issued when a client registers with configurine (see below). This value should be kept secret in order to prevent a third party from impersonating your client. Never use this key in any browser-based code!
* The `timestamp` has a tolerance of +/- 10 minutes; meaning the time on the system issuing the request has to be within 10 minutes of the time of the server hosting configurine.

### Getting a Shared Key

In order to get a shared key, you'll need to register a client with the configurine. All that's required is a unique client ID and an email address. The client ID is used to  identify the client that is interacting with the system. To register a new client, you issue a POST request to the `/register` endpoint and include your desired client ID and email address like so:

```
POST http://localhost:8088/register
Content-Type: application/x-www-form-urlencoded

client_id=myclient&email=myclient@gmail.com
```

Then you'll end up with a JSON response that contains a sharedKey, like so:

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"sharedKey":"16f46698-cad8-4134-9691-a8212a626849","email":"myclient@gmail.com","isConfirmed":false}
```

**Notes:**

* If you provide a client ID that already exists in the system, you'll end up getting a 409 Conflict response code, and will need to choose a different client ID.

## Config API

Config entries will mainly be accessed by name. A config document consists of the following properties:

* `id`: A unique string assigned by Configurine to any new config entry
* `name`: The name of the config entry that comsumers will request values by
* `value`: The value of the config entry that contains the data necessary for consumers
* `associations`: A collection of associations that describe the relationships to environments and applications
* `isActive`: A flag that marks whether or not this config entry is available to consumers
* `isSensitive`: A flag that marks whether or not this config entry requires authentication in order to be available to conumers
* `owner`: The ID of the client that created the entry

### GET /config

This is the main end point that your applications will be using to rerieve config entries from configurine. 

Example Request:

```
GET http://localhost:8088/config?isActive=true&names=loglevel&associations=environment|production
Content-Type: application/json
Authorization: myclient:1371666627113:1371670227113:47a8cdf5560706874688726cb1b3e843783c0811
```

Example Response:

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[{
	"id": "519bc51c9b9c05f772000001",
	"name": "loglevel",
	"value": "error",
	"associations": {
		"applications": [],
		"environments": ["production"],
	},
	"isSensitive": false,
	"isActive": true,
	"owner": "myclient"
}]
```

This end point, by itself, will return all config entries in the system. To filter the result to something more managable, ther are a few query string parameters that you can specify:

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
		"id": "519bc51c9b9c05f772000001",
		"name": "loglevel",
		"value": "error",
		"associations": {
			"applications": [{
				"name": "myapp",
				"version": "1.0.0"
			}],
			"environments": []
		},
		"isSensitive": false,
		"isActive": true,
		"owner": "some_client_id"
	}, {
		"id": "519bc51c9b9c05f772999887",
		"name": "loglevel",
		"value": "info",
		"associations": {
			"applications": [{
				"name": "myapp",
				"version": "2.0.0"
			}],
			"environments": []
		},
		"isSensitive": false,
		"isActive": true,
		"owner": "some_client_id"
	}]

As you can see, there are multiple values for the config entry named "loglevel". In this case, if my application is named "myapp", then I may want to just change the GET request to incorporate the query string parameter for associations to narrow down the results so that my application doesn't have to do as much work to determine which value to use. For example, I could change the request to ```GET /config?names=loglevel&associations=application|myapp|2.0.0``` to narrow the result down to one entry.


**Notes:**
* This end point is also the only config route where the auth token is optional. When it is provided and valid, you are able to retrieve config entries that have the `isSensitive` property flagged as true. Otherwise, as an unauthenticated route, only non-senstive config entries are available. 
* It's usually a not a good idea to have multiple config entries with identical associations and names. If you avoid this practice, and always provide the `names` and `associations` query string parameters, then you will always get a response with one item, which allows the consumer to not have to do any work in determining which entry to use.


### POST /config

To create new config entries in the system, you can issue a POST request to the `/config` end point.

Example Request:

```
POST http://localhost:8088/config
Content-Type: application/json
Authorization: myclient:1371666627113:1371670227113:47a8cdf5560706874688726cb1b3e843783c0811

{
	"name": "loglevel",
	"value": "error",
	"associations": {
		"applications": [],
		"environments": ["production"],
	},
	"isSensitive": false,
	"isActive": true
}
```

Example Response:

```
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
Location: http://localhost:8088/config/519bc51c9b9c05f772000001
```

**Notes:**

* The `id` and `owner` properties are not needed when POSTing a new entry. The `id` is created internally and returned as a part of the location response header. The `owner` is automatically assigned to the client ID of the authenticated client.

### GET /config/{id}

To get a single config entry by ID, you can issue a GET request to the `/config/{id}` end point.

Example Request:

```
GET http://localhost:8088/config/519bc51c9b9c05f772000001
Authorization: myclient:1371666627113:1371670227113:47a8cdf5560706874688726cb1b3e843783c0811
```

Example Response:

```
HTTP/1.1 200 Ok
Content-Type: application/json; charset=utf-8

{
	"id": "519bc51c9b9c05f772000001",
	"name": "loglevel",
	"value": "error",
	"associations": {
		"applications": [],
		"environments": ["production"],
	},
	"isSensitive": false,
	"isActive": true,
	"owner": "myclient"
}
```

### PUT /config/{id}

To update a single config entry by ID, you can issue a PUT request to the `/config/{id}` end point.

Example Request:

```
PUT http://localhost:8088/config/519bc51c9b9c05f772000001
Content-Type: application/json
Authorization: myclient:1371666627113:1371670227113:47a8cdf5560706874688726cb1b3e843783c0811

{
	"id": "519bc51c9b9c05f772000001",
	"name": "loglevel",
	"value": "info",
	"associations": {
		"applications": [],
		"environments": ["production"],
	},
	"isSensitive": false,
	"isActive": true,
	"owner": 'myclient'
}
```

Example Response:

```
HTTP/1.1 204 No Content
```

**Notes:**

* The authenticated client has to be the owner of the config entry being updated.
* Be careful when updating the owner of a config entry. Once changed, the entry can no longer be updated by the previous owner.

### DELETE /config/{id}

To remove a single config entry by ID, you can issue a DELETE request to the `/config/{id}` end point.

Example Request:

```
DELETE http://localhost:8088/config/519bc51c9b9c05f772000001
Authorization: myclient:1371666627113:1371670227113:47a8cdf5560706874688726cb1b3e843783c0811
```

Example Response:

```
HTTP/1.1 204 No Content
```

**Notes:**

* The authenticated client has to be the owner of the config entry being deleted.

# License

The MIT License (MIT) Copyright (c) 2012 Mac Angell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
