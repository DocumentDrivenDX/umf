export { default as coreRecordTypeOperationV6Schema } from '../../spec/core/record-type-operation-v6.schema.json';
export { default as coreRecordTypeOperationV5Schema } from '../../spec/core/record-type-operation-v5.schema.json';
export { default as coreRecordTypeOperationV4Schema } from '../../spec/core/record-type-operation-v4.schema.json';
import { type Document } from './types';
import { type CoreKindDeclaration } from './field-kind';
export { default as coreRecordTypeOperationV3Schema } from '../../spec/core/record-type-operation-v3.schema.json';
export { default as coreRecordTypeOperationV2Schema } from '../../spec/core/record-type-operation-v2.schema.json';
export { default as coreRecordTypeOperationSchema } from '../../spec/core/record-type-operation.schema.json';
export interface CoreRecordTypeDeclaration {
    operation: 'declare-core-record-type';
    version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0' | '6.0.0';
    source: Document;
    target: Document;
    fieldAuthor: CoreKindDeclaration;
    recordAuthor: CoreKindDeclaration;
    reference: {
        role: 'record-type';
        module: string;
        element: string;
    };
    provenance: {
        origin: 'authored';
        idealPath: string;
        recordPath: string;
        nativePath: null;
        basis: 'explicit-record-type-declaration';
        binding: {
            id: 'umf.core.record-type.authoring';
            version: '1.0.0' | '2.0.0' | '3.0.0' | '4.0.0' | '5.0.0' | '6.0.0';
        };
    };
}
/** Explicit type relationship. Generic role strings are never treated as author receipts. */
export declare function declareCoreRecordType(fieldInput: CoreKindDeclaration, recordInput: CoreKindDeclaration): CoreRecordTypeDeclaration;
/** Checks consistency and current identity resolution, not cryptographic authorship. */
export declare function verifyCoreRecordTypeDeclaration(input: CoreRecordTypeDeclaration, current: Document): CoreRecordTypeDeclaration;
