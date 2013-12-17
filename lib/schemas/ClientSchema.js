var CommonSchemas = require('./Common'),
	clientId = {
		type: 'string',
		minLength: 3,
		pattern: '^[\\w_0-9-]+$',
		description: 'A unique identifier for the client/user'
	},
	email = {
		type: 'string',
		description: 'An email address associated to the client'
	},
	isAdmin = {
		type: 'boolean',
		description: 'A flag denoting whether or not the client is an admin'
	},
	isConfirmed = {
		type: 'boolean',
		description: 'A flag denoting whether or not the client is confirmed as a valid client'
	},
	sharedKey = {
		type: 'string',
		description: 'A string used to generate a signature for obtaining a token for the client'
	},
	clientObj = {
		clientId: clientId,
		email: email,
		isAdmin: isAdmin,
		isConfirmed: isConfirmed,
		sharedKey: sharedKey,
		created: CommonSchemas.misc.created,
		modified: CommonSchemas.misc.modified
	};

module.exports = {
	model: clientObj,
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
				clientId: clientId
			},
			required: ['clientId']
		},
		response: {
			sample: 100,
			failAction: 'log',
			schema: {
				type: 'object',
				properties: clientObj,
				required: ['clientId', 'email', 'sharedKey', 'isConfirmed', 'isAdmin', 'created', 'modified'],
				additionalProperties: false
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
			properties: clientObj,
			required: ['clientId', 'email'],
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
		payload: {
			type: 'object',
			properties: clientObj,
			required: ['clientId', 'email', 'isConfirmed', 'isAdmin'],
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
				clientId: clientId
			},
			required: ['clientId']
		}
	}
};