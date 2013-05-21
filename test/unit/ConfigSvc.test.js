var assert = require('assert'),
	ConfigSvc = require('../../lib-test/api/ConfigSvc.js'),
	_ = require('underscore'),
	cfgSvc = new ConfigSvc();

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

});