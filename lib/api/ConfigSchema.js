var T = require('joi').Types,
	schema = {},
	applicationSchema = T.Object({
		name: T.String().min(1).required(),
		versions: T.Array().includes(T.String().min(1).required()).required()
	}),
	environmentSchema = T.String().min(1).required(),
	associationSchema = T.Object({
		applications: T.Array().includes(applicationSchema).optional(),
		environments: T.Array().includes(environmentSchema).optional()
	}).optional();


schema._id = T.String().min(1).optional();
schema.name = T.String().min(3).required();
schema.value = T.Any().required();
schema.associations = associationSchema;
schema.owner = T.String().min(1).required();
schema.isSensitive = T.Boolean().required();
schema.isActive = T.Boolean().required();
schema.created = T.Object().required();
schema.modified = T.Object().required();

module.exports = schema;