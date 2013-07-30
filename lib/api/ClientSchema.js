var T = require('joi').Types,
	schema = {},
	targetSchema = T.Object({
		id: T.String().min(1).required(),
		type: T.String().allow(['group', 'course', 'ep']).required()
	}).optional();

schema._id = T.String().min(1).optional();
schema.name = T.String().min(3).required();
schema.sharedKey = T.String().min(1).required();
schema.privateKey = T.String().min(1).required();
schema.email = T.String().email().required();
schema.isConfirmed = T.Boolean().required();
schema.isAdmin = T.Boolean().required();
schema.created = T.Object().required();
schema.modified = T.Object().required();

module.exports = schema;