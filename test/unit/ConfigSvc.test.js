var assert = require('assert'),
	sinon = require('sinon'),
	ConfigSvc = require('../../lib/api/ConfigSvc.js'),
	_ = require('underscore'),
	mockDb = sinon.mock(require('mongodb').Db)
	cfgSvc = new ConfigSvc(),
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
				
			}
		};
		return coll;
	},
	getMockConfigDoc = function() {
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
		return config;
	};

describe('ConfigSvc Unit Tests', function() {
	describe('_cloneDocument()', function() {
		
		it('should clone a config object', function(done) {
			var cfg = {
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

			var cloned = cfgSvc._cloneDocument(cfg);
			assert.strictEqual(cloned.name, cfg.name, 'The name property should be cloned');
			assert(_.isEqual(cloned.value, cfg.value), 'The value property should be cloned');
			assert(_.isEqual(cloned.associations, cfg.associations), 'The associations property should be cloned');
			assert.strictEqual(cloned.isSensitive, cfg.isSensitive, 'The isSensitive property should be cloned');
			assert.strictEqual(cloned.isActive, cfg.isActive, 'The isActive property should be cloned');

			assert(!cloned._id, 'The _id property should NOT be cloned');
			assert(!cloned.created, 'The created property should NOT be cloned');
			assert(!cloned.modified, 'The modified property should NOT be cloned');
			done();
		});
	});
	describe('findAll()', function() {
		it('should find all config documents', function(done) {
			var dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			cfgSvc.findAll({}, function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should find all config documents with default selector', function(done) {
			var dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockConfigDoc()]);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			cfgSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when findAll connot complete', function(done) {
			var dbMock = sinon.mock(cfgSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			cfgSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});
		
	});

});