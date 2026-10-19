
import {snapshotSchema} from '../validation/internal-schema';
import core from '../../spec/core/schema.json';

import reference from '../../spec/core/semantic-type-reference.schema.json';
import operations from '../../spec/core/semantic-types-operation.schema.json';
import {createValidator} from '../validation/schema';
const validator=createValidator();
for(const schema of [reference,core])validator.addSchema(snapshotSchema(schema));
export const checkSemanticTypeOperation=validator.compile(snapshotSchema(operations));
export const checkSemanticTypeIdentity=validator.compile(snapshotSchema(operations.$defs.identity));
export {canonicalSchemaJson as semanticTypesCanonical} from './schema-literals';
