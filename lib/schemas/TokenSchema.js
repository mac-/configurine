var CommonSchemas = require('./Common'),
	ClientSchema = require('./ClientSchema'),
	grant_type = {
		type: 'string',
		enum: ['client_credentials'],
		description: 'The type of grant that is being requested. In this case it will always be: client_credentials'
	},
	client_id = ClientSchema.model.clientId,
	timestamp = {
		type: 'integer',
		minimum: 0,
		description: 'The number of milliseconds since 00:00 January 1st, 1970 when the signature was created'
	},
	signature = {
		type: 'string',
		minLength: 1,
		description: 'A sha1 HMAC of the client_id and timestamp joined with a : character and hashed with the client\'s shared key'
	},
	tokenObj = {
		grant_type: grant_type,
		signature: signature,
		client_id: client_id,
		timestamp: timestamp
	};

module.exports = {
	model: tokenObj,
	POST: {
		swagger: true,
		payload: {
			type: 'object',
			properties: tokenObj,
			required: ['grant_type', 'signature', 'client_id', 'timestamp'],
			additionalProperties: false
		}
	}
};