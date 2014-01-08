module.exports = {
	headers: {
		authorization: {
			type: 'string',
			description: 'A calid acces token issued for a given client for accessing protected resources'
		}
	},
	misc: {
		created: {
			type: 'string',
			format: 'date-time',
			description: 'The date/time that the resource was created'
		},
		modified: {
			type: 'string',
			format: 'date-time',
			description: 'The date/time that the resource was last modified'
		}
	}
};