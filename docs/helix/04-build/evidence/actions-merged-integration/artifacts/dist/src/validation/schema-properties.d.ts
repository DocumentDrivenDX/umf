import { Registry } from '../registry/registry';
import { type Document, type Validation } from '../model/types';
export declare const checkSchemaProperties: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkCoreLiteral: import("ajv").ValidateFunction<unknown>;
export { default as coreSchemaPropertiesDocumentSchema } from '../../spec/core/schema-properties-document.schema.json';
/** Private validation view only. It must never be used as a native downgrade. */
export declare function schemaPropertiesLegacyView(input: Document): Document;
export declare function validateSchemaPropertiesDocument(input: unknown, registry?: Registry): Validation;
