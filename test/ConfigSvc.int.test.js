var assert = require('assert'),
	async = require('async'),
	request = require('request'),
	fork = require('child_process').fork,
	process,
	ConfigSvc = require('../lib-test/api/ConfigSvc.js'),
	_ = require('underscore'),
	testConfig = require('./integrationTestConfig.json'),
	cfgSvc = new ConfigSvc(testConfig),
	devEnvTag = { type: 'environment', value: 'development' },
	prodEnvTag = { type: 'environment', value: 'production' },
	otherEnvTag = { type: 'environment', value: 'other' },
	appTagV1 = { type: 'application', value: 'fnord-v1' },
	appTagV2 = { type: 'application', value: 'fnord-v2' },
	appTagV3 = { type: 'application', value: 'fnord-v3' },
	machineTag1 = { type: 'machine', value: 'machineName1' },
	machineTag2 = { type: 'machine', value: 'machineName2' },
	machineTag3 = { type: 'machine', value: 'machineName3' },
	configName = 'myConfig',
	mockCfg1 = {
			name: configName,
			value: { some: 'object1' },
			tags: [devEnvTag],
			isSensitive: false,
			isActive: true
		},
	mockCfg2 = {
			name: configName,
			value: { some: 'object2' },
			tags: [prodEnvTag],
			isSensitive: false,
			isActive: true
		},
	mockCfg3 = {
			name: configName,
			value: { some: 'object3' },
			tags: [devEnvTag, appTagV1],
			isSensitive: false,
			isActive: true
		},
	mockCfg4 = {
			name: configName,
			value: { some: 'object4' },
			tags: [devEnvTag, appTagV2],
			isSensitive: false,
			isActive: true
		},
	mockCfg5 = {
			name: configName,
			value: { some: 'object5' },
			tags: [prodEnvTag, appTagV1],
			isSensitive: false,
			isActive: true
		},
	mockCfg6 = {
			name: configName,
			value: { some: 'object6' },
			tags: [prodEnvTag, appTagV2],
			isSensitive: false,
			isActive: true
		},
	mockCfg7 = {
			name: configName,
			value: { some: 'object7' },
			tags: [machineTag1, appTagV1],
			isSensitive: false,
			isActive: true
		},
	mockCfg8 = {
			name: configName,
			value: { some: 'object8' },
			tags: [machineTag2, appTagV1],
			isSensitive: false,
			isActive: true
		},
	mockCfg9 = {
			name: configName,
			value: { some: 'object9' },
			tags: [machineTag1, appTagV2],
			isSensitive: false,
			isActive: true
		},
	mockCfg10 = {
			name: configName,
			value: { some: 'object10' },
			tags: [machineTag2, appTagV2],
			isSensitive: false,
			isActive: true
		},
	mockCfg11 = {
			name: configName,
			value: { some: 'object11' },
			tags: [devEnvTag, machineTag1, appTagV1],
			isSensitive: false,
			isActive: true
		},
	mockCfg12 = {
			name: configName,
			value: { some: 'object12' },
			tags: [devEnvTag, machineTag2, appTagV1],
			isSensitive: false,
			isActive: true
		},
	mockCfg13 = {
			name: configName,
			value: { some: 'object13' },
			tags: [prodEnvTag, machineTag1, appTagV2],
			isSensitive: false,
			isActive: true
		},
	mockCfg14 = {
			name: configName,
			value: { some: 'object14' },
			tags: [prodEnvTag, machineTag2, appTagV2],
			isSensitive: false,
			isActive: true
		},
	mockCfg15 = {
			name: configName,
			value: { some: 'object15' },
			tags: [prodEnvTag, machineTag2, appTagV1],
			isSensitive: false,
			isActive: false		// this config obj should never be returned
		},
	mockCfg16 = {
			name: configName,
			value: { some: 'object16' },
			tags: [prodEnvTag, machineTag1, appTagV1],
			isSensitive: true,	// this config obj should only be returned if the request included auth
			isActive: true
		},
	allCfgObjs = [mockCfg1, mockCfg2, mockCfg3, mockCfg4, mockCfg5, mockCfg6, mockCfg7, mockCfg8, mockCfg9, mockCfg10, mockCfg11, mockCfg12, mockCfg13, mockCfg14, mockCfg15, mockCfg16],
	allCfgObjsAfterInsert = [],
	insertConfig = function(insertCallback) {
		cfgSvc.connect(function(err) {
			cfgSvc.removeAll(function(err) {
				assert(!err);
				async.forEach(allCfgObjs, function(item, callback) {
					cfgSvc.connect(function(err) {
						cfgSvc.insert(item, function(err, result) {
							allCfgObjsAfterInsert.push(result);
							callback();
						});
					});
				}, function(error, results) {
					assert(!error);
					insertCallback();
				});
			});
		});
	},
	removeConfig = function(removeCallback) {
		async.forEach(allCfgObjsAfterInsert, function(item, callback) {
			cfgSvc.connect(function(err) {
				assert(!err);
				cfgSvc.remove(item._id.toString(), callback);
			});
		}, function(error, results) {
			assert(!error);
			removeCallback();
		});
	},
	testRequest = function(tags, expectedValue, useAuth, callback) {
		if (!callback && typeof(useAuth) === 'function') {
			callback = useAuth;
			useAuth = false;
		}
		var tagString = '',
			baseUrl = (useAuth) ? 'http://user:user@localhost:8088' : 'http://localhost:8088',
			url = baseUrl + '/config?name=' + configName + '&tags=';
		for (var i = 0; i < tags.length; i++) {
			tagString = tagString + tags[i].type + ':' + tags[i].value + ';';
		}
		request.get({url: url + tagString, json:true}, function(err, res, body) {
			assert(!err);
			assert(_.isEqual(body.config[configName], expectedValue));
			callback();
		});
	};

describe('ConfigSvc Integration Tests', function() {
	describe('setup', function() {
		
		it('should successfully stage data in the DB', function(done) {
			insertConfig(done);
		});
		
		it('should start the app', function(done) {
			process = fork('app.js', ['-u', 'demo', '-p', '73514', '-g', 'error']);
			setTimeout(function() {
				done();
			}, 1500);
		});
	});

	describe('test', function() {
		it('should resolve to value #1', function(done) {
			testRequest([devEnvTag, machineTag1, appTagV3], mockCfg1.value, done);
		});
		it('should resolve to value #2', function(done) {
			testRequest([prodEnvTag, machineTag3, appTagV3], mockCfg2.value, done);
		});
		it('should resolve to value #3', function(done) {
			testRequest([devEnvTag, machineTag3, appTagV1], mockCfg3.value, done);
		});
		it('should resolve to value #4', function(done) {
			testRequest([devEnvTag, machineTag3, appTagV2], mockCfg4.value, done);
		});
		it('should resolve to value #5', function(done) {
			testRequest([prodEnvTag, machineTag3, appTagV1], mockCfg5.value, done);
		});
		it('should resolve to value #6', function(done) {
			testRequest([prodEnvTag, machineTag3, appTagV2], mockCfg6.value, done);
		});
		it('should resolve to value #7', function(done) {
			testRequest([prodEnvTag, machineTag1, appTagV1], mockCfg7.value, done);
		});
		it('should resolve to value #8', function(done) {
			testRequest([prodEnvTag, machineTag2, appTagV1], mockCfg8.value, done);
		});
		it('should resolve to value #9', function(done) {
			testRequest([devEnvTag, machineTag1, appTagV2], mockCfg9.value, done);
		});
		it('should resolve to value #10', function(done) {
			testRequest([devEnvTag, machineTag2, appTagV2], mockCfg10.value, done);
		});
		it('should resolve to value #11', function(done) {
			testRequest([devEnvTag, machineTag1, appTagV1], mockCfg11.value, done);
		});
		it('should resolve to value #12', function(done) {
			testRequest([devEnvTag, machineTag2, appTagV1], mockCfg12.value, done);
		});
		it('should resolve to value #13', function(done) {
			testRequest([prodEnvTag, machineTag1, appTagV2], mockCfg13.value, done);
		});
		it('should resolve to value #14', function(done) {
			testRequest([prodEnvTag, machineTag2, appTagV2], mockCfg14.value, done);
		});
		it('should resolve to value #16', function(done) {
			testRequest([prodEnvTag, machineTag1, appTagV1], mockCfg16.value, true, done);
		});
	});

	describe('teardown', function() {
		it('should shut down the app', function(done) {
			process.kill();
			done();
		});
		it('should successfully remove the data in the DB', function(done) {
			removeConfig(done);
		});
	});
});



