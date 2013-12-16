var CommonSchemas = require('./Common'),
	ClientSchema = require('./ClientSchema'),
	id = {
		type: 'string',
		minLength: 24,
		maxLength: 24,
		description: 'A unique identifier for the config entry automatically assigned by Configurine'
	},
	name = {
		type: 'string',
		minLength: 1,
		description: 'The name of the config entry that the value can be referenced by'
	},
	value = {
		type: ['array', 'boolean', 'number', 'string', 'object'],
		description: 'The value of the config entry'
	},
	appAssociation = {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				minLength: 1,
				description: 'The name of the application that the config entry is associated to'
			},
			versions: {
				type: 'array',
				items: {
					type: 'string',
					minLength: 1,
					description: 'The version of the application that the config entry is associated to'
				}
			}
		}
	},
	envAssociation = {
		type: 'string',
		minLength: 1,
		description: 'The name of the environment that the config entry is associated to'
	},
	associations = {
		type: 'object',
		properties: {
			applications: {
				type: 'array',
				items: appAssociation
			},
			environments: {
				type: 'array',
				items: envAssociation
			}
		},
		description: 'The collecitons of associated applications and environments for the config entry'
	},
	isSensitive = {
		type: 'boolean',
		description: 'A flag that denotes whether or not this config entry contains sensitive information and should only be available to authenticated clients'
	},
	isActive = {
		type: 'boolean',
		description: 'A flag that denotes whether or not this config entry is available to be used'
	},
	owner = ClientSchema.model.clientId,
	configObj = {
		id: id,
		name: name,
		value: value,
		associations: associations,
		isSensitive: isSensitive,
		isActive: isActive,
		owner: owner,
		created: CommonSchemas.misc.created,
		modified: CommonSchemas.misc.modified
	};

module.exports = {
	model: configObj,
	GET: {
		swagger: true,
		headers: {
			type: 'object',
			properties: {
				authorization: CommonSchemas.headers.authorization
			}
		},
		path: {
			type: 'object',
			properties: {
				id: id
			},
			required: ['id']
		},
		response: {
			sample: 100,
			failAction: 'log',
			schema: {
				type: 'object',
				properties: configObj,
				required: ['id', 'name', 'value', 'associations', 'isSensitive', 'isActive', 'owner', 'created', 'modified'],
				additionalProperties: false
			}
		}
	},
	GET_ALL: {
		swagger: true,
		headers: {
			type: 'object',
			properties: {
				authorization: CommonSchemas.headers.authorization
			}
		},
		query: {
			type: 'object',
			properties: {
				names: {
					type: 'array',
					items: name
				},
				associations: {
					type: 'array',
					items: {
						type: 'string',
						minLength: 1,
						pattern: '^(environment|application)\\|(.+\\|)?.+$',
					}
				},
				isActive: isActive
			},
			additionalProperties: false
		},
		response: {
			sample: 100,
			failAction: 'log',
			schema: {
				type: 'array',
				items: {
					type: 'object',
					properties: configObj,
					required: ['id', 'name', 'value', 'associations', 'isSensitive', 'isActive', 'owner', 'created', 'modified'],
					additionalProperties: false
				}
			}
		}
	},
	POST: {
		swagger: true,
		headers: {
			type: 'object',
			properties: {
				authorization: CommonSchemas.headers.authorization
			}
		},
		payload: {
			type: 'object',
			properties: configObj,
			required: ['name', 'value', 'associations', 'isSensitive', 'isActive'],
			additionalProperties: false
		}
	},
	PUT: {
		swagger: true,
		headers: {
			type: 'object',
			properties: {
				authorization: CommonSchemas.headers.authorization
			}
		},
		path: {
			type: 'object',
			properties: {
				id: id
			},
			required: ['id']
		},
		payload: {
			type: 'object',
			properties: configObj,
			required: ['name', 'value', 'associations', 'isSensitive', 'isActive', 'owner'],
			additionalProperties: false
		}
	},
	DELETE: {
		swagger: true,
		headers: {
			type: 'object',
			properties: {
				authorization: CommonSchemas.headers.authorization
			}
		},
		path: {
			type: 'object',
			properties: {
				id: id
			},
			required: ['id']
		}
	}
}