/*****************************************************************
  Creating Joi Type of Any until they publish their own version
*****************************************************************/
// Load modules

var BaseType = require('joi').Types.Base;
var Utils = require('joi').Utils;

// Declare internals

var typObj = {};


typObj.createType = function () {

    return new typObj.AnyType();
};


typObj.AnyType = function () {

    typObj.AnyType.super_.call(this);
    Utils.mixin(this, BaseType);
    return this;
};

Utils.inherits(typObj.AnyType, BaseType);


typObj.AnyType.prototype.__name = "Any";


typObj.AnyType.prototype._base = function() {

    return function(value, obj, key, errors, keyPath) {

        return true; // null is not allowed by default
    };
};

typObj.AnyType.prototype.base = function () {

    this.add('base', this._base(), arguments);
    return this;
};
/*****************************************************************
  END
*****************************************************************/


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
schema.value = typObj.AnyType().required(); // change me when joi module is ready
schema.associations = associationSchema;
schema.owner = T.String().min(1).required();
schema.isSensitive = T.Boolean().required();
schema.isActive = T.Boolean().required();
schema.created = T.Object().required();
schema.modified = T.Object().required();

module.exports = schema;