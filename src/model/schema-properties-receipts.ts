import sourceSchema from '../../spec/core/relationship-document.schema.json';
import targetSchema from '../../spec/core/schema-properties-document.schema.json';
import receiptSchema from '../../spec/core/schema-properties-receipt.schema.json';
import {createValidator} from '../validation/schema';
export {default as coreSchemaPropertiesReceiptSchema} from '../../spec/core/schema-properties-receipt.schema.json';
const validator=createValidator();validator.addSchema(sourceSchema);validator.addSchema(targetSchema);
export const checkSchemaPropertyReceipt=validator.compile(receiptSchema);
