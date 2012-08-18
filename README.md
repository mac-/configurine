conman
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

More Coming Soon...

License
===
The MIT License (MIT) Copyright (c) 2012 Mac Angell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
