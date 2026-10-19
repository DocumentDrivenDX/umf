import sourceSchema from '../../spec/core/relationship-document.schema.json';
import targetSchema from '../../spec/core/schema-properties-document.schema.json';
import transitionSchema from '../../spec/core/schema-properties-transition.schema.json';
import {createValidator} from '../validation/schema';
export {default as coreSchemaPropertiesTransitionSchema} from '../../spec/core/schema-properties-transition.schema.json';
const validator=createValidator();validator.addSchema(sourceSchema);validator.addSchema(targetSchema);
export const checkSchemaPropertyTransition=validator.compile(transitionSchema);
