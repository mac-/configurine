var assert = require('assert'),
	sinon = require('sinon'),
	ConfigSvc = require('../../lib/api/ConfigSvc.js'),
	configSchema = require('../../lib/api/ConfigSchema.js'),
	_ = require('underscore'),
	getMockCollection = function(mockErr, mockResult) {
		var coll = {
			ensureIndex: function(obj, opts, cb) {
				cb(null, 'fnord');
			},
			find: function(selector) {
				var obj = {
					toArray: function(cb) {
						cb(mockErr, mockResult);
					}
				};
				return obj;
			},
			findOne: function(selector, cb) {
				cb(mockErr, mockResult);
			},
			insert: function(obj, opts, cb) {
				cb(mockErr, mockResult);
			},
			update: function(selector, obj, opts, cb) {
				cb(mockErr, mockResult);
			},
			remove: function(selector, opts, cb) {
				cb(mockErr, mockResult);
			}
		};
		return coll;
	},
	getMockConfigDoc = function(forInsert) {
		var config = {
		    "_id": "519bc51c9b9c05f772000001",
		    "name": "loglevel",
		    "value": "error",
		    "associations": {
		        "applications": [],
		        "environments": ["production"],
		    },
		    "isSensitive": false,
		    "isActive": true,
		    "owner": "myclient",
		    "created": new Date(),
		    "modified": new Date()
		};
		if (forInsert) {
			delete config._id;
			delete config.created;
			delete config.modified;
		}
		return config;
	};

describe('ConfigSvc Unit Tests', function() {

	describe('new ConfigSvc()', function() {
		it('should handle repl set', function(done) {
			var cfgSvc = new ConfigSvc({
					db: {
						hosts: ['127.0.0.1:27017', '127.0.0.2']
					}
				});
			assert(cfgSvc);
			done();
		});

		it('should add port if not included in the host', function(done) {
			var cfgSvc = new ConfigSvc({
					db: {
						hosts: ['127.0.0.1']
					}
				});
			assert(cfgSvc);
			done();
		});

	});

	describe('_cloneDocument()', function() {
		
		it('should clone a config object', function(done) {
			var cfgSvc = new ConfigSvc(),
				cfg = {
				_id: 'a56cbe9070011bd74dde0100',
				name: 'myConfig',
				value: {
					keys: ['some', 'random', 'data'],
					user: 'fnord'
				},
				created: new Date(2010, 4, 9),
				modified: new Date(2012, 7, 1),
				associations: {
					applications: [
						{
							name: 'fnord',
							versions: ['1.0.0']
						}
					],
					environments: ['prod']
				},
				isSensitive: false,
				isActive: true
			};

			var cloned = cfgSvc._cloneDocument(cfg, configSchema);
			assert.strictEqual(cloned.name, cfg.name, 'The name property should be cloned');
			assert(_.isEqual(cloned.value, cfg.value), 'The value property should be cloned');
			assert(_.isEqual(cloned.associations, cfg.associations), 'The associations property should be cloned');
			assert.strictEqual(cloned.isSensitive, cfg.isSensitive, 'The isSensitive property should be cloned');
			assert.strictEqual(cloned.isActive, cfg.isActive, 'The isActive property should be cloned');
			assert.strictEqual(cloned.created.getTime(), cfg.created.getTime(), 'The created property should be cloned');
			assert.strictEqual(cloned.modified.getTime(), cfg.modified.getTime(), 'The modified property should be cloned');

			assert(!cloned._id, 'The _id property should NOT be cloned');
			done();
		});
	});

	describe('connect()', function() {
		it('should authenticate if credentials are provided', function(done) {
			var cfgSvc = new ConfigSvc({
					db: {
						userName: 'fnord',
						password: 'dronf'
					}
				}),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);
			dbMock.expects('authenticate').once().callsArgWith(2, null, {});

			cfgSvc.connect(function(err, result) {
				dbMock.verify();
				assert(!err);
				done();
			});
		});

		it('should return error if authenticate fails', function(done) {
			var cfgSvc = new ConfigSvc({
					db: {
						userName: 'fnord',
						password: 'dronf'
					}
				}),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);
			dbMock.expects('authenticate').once().callsArgWith(2, new Error());

			cfgSvc.connect(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

	});


	describe('disconnect()', function() {
		it('should disconnect', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db),
				serverConfigMock = sinon.mock(cfgSvc._db.serverConfig);

			serverConfigMock.expects('isConnected').once();
			cfgSvc.disconnect();
			dbMock.verify();
			serverConfigMock.verify();
			done();
		});

	});


	describe('findAll()', function() {
		it('should find all config documents', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findAll({}, function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should find all config documents with default selector', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.findAll);
			done();
		});
		
	});



	describe('findById()', function() {
		it('should find config document by ID', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockConfigDoc());
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.findById);
			done();
		});
		
	});



	describe('findByName()', function() {
		it('should find config document by name', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByName('loglevel', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				assert.strictEqual(result[0].name, 'loglevel');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByName('loglevel', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.findByName('loglevel', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.findByName('loglevel', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.findByName);
			done();
		});
		
	});


	describe('findByApplicationAssociation()', function() {
		it('should find config document by app name and version', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByApplicationAssociation('myapp', '1.0.0', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByApplicationAssociation('myapp', '1.0.0', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.findByApplicationAssociation('myapp', '1.0.0', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.findByApplicationAssociation('myapp', '1.0.0', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.findByApplicationAssociation);
			done();
		});
		
	});



	describe('findByEnvironmentAssociation()', function() {
		it('should find config document by env name', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByEnvironmentAssociation('production', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByEnvironmentAssociation('production', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.findByEnvironmentAssociation('production', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.findByEnvironmentAssociation('production', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.findByEnvironmentAssociation);
			done();
		});
		
	});


	describe('findByNameAndEnvironmentAssociation()', function() {
		it('should find config document by name and env name', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByNameAndEnvironmentAssociation('loglevel', 'production', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.findByNameAndEnvironmentAssociation('loglevel', 'production', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.findByNameAndEnvironmentAssociation('loglevel', 'production', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.findByNameAndEnvironmentAssociation('loglevel', 'production', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.findByNameAndEnvironmentAssociation);
			done();
		});
		
	});



	describe('insert()', function() {
		it('should insert the config document', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.insert(getMockConfigDoc(true), function(err, result) {
				dbMock.verify();
				console.log(err, result);
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the insert fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.insert(getMockConfigDoc(true), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.insert(getMockConfigDoc(true), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.insert(getMockConfigDoc(true), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when document is malformed', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.insert({ a:1 }, function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.insert);
			done();
		});

		it('should throw an exception when the document contains an _id property', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(function() {
				cfgSvc.insert(getMockConfigDoc(), function(err, result) {});
			});
			done();
		});
		
	});



	describe('update()', function() {
		it('should update the config document', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockConfigDoc());
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.update('519bc51c9b9c05f772000001', getMockConfigDoc(), function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the update fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.update('519bc51c9b9c05f772000001', getMockConfigDoc(), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.update('519bc51c9b9c05f772000001', getMockConfigDoc(), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.update('519bc51c9b9c05f772000001', getMockConfigDoc(), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when document is malformed', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.update('519bc51c9b9c05f772000001', { a:1 }, function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.update);
			done();
		});
		
	});


	describe('remove()', function() {
		it('should remove the config document', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockConfigDoc());
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the remove fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.remove);
			done();
		});
		
	});

	describe('removeAll()', function() {
		it('should remove the config document', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockConfigDoc());
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the removeAll fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			cfgSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().withExactArgs('config').throws(new Error());

			cfgSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			cfgSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var cfgSvc = new ConfigSvc(),
				dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().withExactArgs('config').returns(coll);

			assert.throws(cfgSvc.removeAll);
			done();
		});
		
	});

});