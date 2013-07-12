var assert = require('assert'),
	sinon = require('sinon'),
	ClientSvc = require('../../lib/api/ClientSvc.js'),
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
	getMockClientDoc = function(forInsert) {
		var client = {
		    "_id": "519bc51c9b9c05f772000001",
		    "name": "myclient",
		    "sharedKey": "somekey",
		    "email": "myemail@gmail.com",
		    "isConfirmed": false,
		    "isAdmin": false,
		    "privateKey": '841239874078ac8f809e098d',
		    "created": new Date(),
		    "modified": new Date()
		};
		if (forInsert) {
			delete client._id;
			delete client.created;
			delete client.modified;
		}
		return client;
	};

describe('ClientSvc Unit Tests', function() {

	describe('new ClientSvc()', function() {
		it('should handle repl set', function(done) {
			var clientSvc = new ClientSvc({
					db: {
						hosts: ['127.0.0.1:27017', '127.0.0.2']
					}
				});
			assert(clientSvc);
			done();
		});

		it('should add port if not included in the host', function(done) {
			var clientSvc = new ClientSvc({
					db: {
						hosts: ['127.0.0.1']
					}
				});
			assert(clientSvc);
			done();
		});

	});

	describe('_cloneDocument()', function() {
		
		it('should clone a config object', function(done) {
			var clientSvc = new ClientSvc(),
				client = getMockClientDoc();

			var cloned = clientSvc._cloneDocument(client);
			assert.strictEqual(cloned.name, client.name, 'The name property should be cloned');
			assert.strictEqual(cloned.sharedKey, client.sharedKey, 'The sharedKey property should be cloned');
			assert.strictEqual(cloned.email, client.email, 'The email property should be cloned');
			assert.strictEqual(cloned.isConfirmed, client.isConfirmed, 'The isConfirmed property should be cloned');
			assert.strictEqual(cloned.privateKey, client.privateKey, 'The privateKey property should be cloned');

			assert(!cloned._id, 'The _id property should NOT be cloned');
			assert(!cloned.created, 'The created property should NOT be cloned');
			assert(!cloned.modified, 'The modified property should NOT be cloned');
			done();
		});
	});

	describe('connect()', function() {
		it('should authenticate if credentials are provided', function(done) {
			var clientSvc = new ClientSvc({
					db: {
						userName: 'fnord',
						password: 'dronf'
					}
				}),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);
			dbMock.expects('authenticate').once().callsArgWith(2, null, {});

			clientSvc.connect(function(err, result) {
				dbMock.verify();
				assert(!err);
				done();
			});
		});

		it('should return error if authenticate fails', function(done) {
			var clientSvc = new ClientSvc({
					db: {
						userName: 'fnord',
						password: 'dronf'
					}
				}),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);
			dbMock.expects('authenticate').once().callsArgWith(2, new Error());

			clientSvc.connect(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

	});


	describe('disconnect()', function() {
		it('should disconnect', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db),
				serverConfigMock = sinon.mock(clientSvc._db.serverConfig);

			serverConfigMock.expects('isConnected').once();
			clientSvc.disconnect();
			dbMock.verify();
			serverConfigMock.verify();
			done();
		});

	});


	describe('findAll()', function() {
		it('should find all config documents', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockClientDoc()]);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.findAll({}, function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should find all config documents with default selector', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockClientDoc()]);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().callsArgWith(1, new Error(), null);

			clientSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			clientSvc.findAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(clientSvc.findAll);
			done();
		});
		
	});



	describe('findById()', function() {
		it('should find config document by ID', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockClientDoc());
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().callsArgWith(1, new Error(), null);

			clientSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			clientSvc.findById('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(clientSvc.findById);
			done();
		});
		
	});



	describe('findByName()', function() {
		it('should find config document by name', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockClientDoc()]);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.findByName('myclient', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result[0]._id, '519bc51c9b9c05f772000001');
				assert.strictEqual(result[0].name, 'myclient');
				done();
			});
		});

		it('should return error when the find fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.findByName('myclient', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().callsArgWith(1, new Error(), null);

			clientSvc.findByName('myclient', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			clientSvc.findByName('myclient', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(clientSvc.findByName);
			done();
		});
		
	});

	describe('insert()', function() {
		it('should insert the config document', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, [getMockClientDoc()]);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.insert(getMockClientDoc(true), function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the insert fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.insert(getMockClientDoc(true), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().callsArgWith(1, new Error(), null);

			clientSvc.insert(getMockClientDoc(true), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			clientSvc.insert(getMockClientDoc(true), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when document is malformed', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.insert({ a:1 }, function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(clientSvc.insert);
			done();
		});

		it('should throw an exception when the document contains an _id property', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(function() {
				clientSvc.insert(getMockClientDoc(), function(err, result) {});
			});
			done();
		});
		
	});



	describe('update()', function() {
		it('should update the config document', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockClientDoc());
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.update('519bc51c9b9c05f772000001', getMockClientDoc(), function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the update fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.update('519bc51c9b9c05f772000001', getMockClientDoc(), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().callsArgWith(1, new Error(), null);

			clientSvc.update('519bc51c9b9c05f772000001', getMockClientDoc(), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			clientSvc.update('519bc51c9b9c05f772000001', getMockClientDoc(), function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when document is malformed', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.update('519bc51c9b9c05f772000001', { a:1 }, function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(clientSvc.update);
			done();
		});
		
	});


	describe('remove()', function() {
		it('should remove the config document', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockClientDoc());
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the remove fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().callsArgWith(1, new Error(), null);

			clientSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			clientSvc.remove('519bc51c9b9c05f772000001', function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(clientSvc.remove);
			done();
		});
		
	});

	describe('removeAll()', function() {
		it('should remove the config document', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(null, getMockClientDoc());
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(!err);
				assert.strictEqual(result._id, '519bc51c9b9c05f772000001');
				done();
			});
		});

		it('should return error when the removeAll fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			clientSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting the collection fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			dbMock.expects('collection').once().callsArgWith(1, new Error(), null);

			clientSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should return error when getting opening the db fails', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArgWith(0, new Error());

			clientSvc.removeAll(function(err, result) {
				dbMock.verify();
				assert(err);
				done();
			});
		});

		it('should throw an exception when missing params', function(done) {
			var clientSvc = new ClientSvc(),
				dbMock = sinon.mock(clientSvc._db);
			dbMock.expects('open').once().callsArg(0);

			var coll = getMockCollection(new Error(), null);
			dbMock.expects('collection').once().callsArgWith(1, null, coll);

			assert.throws(clientSvc.removeAll);
			done();
		});
		
	});

});