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

