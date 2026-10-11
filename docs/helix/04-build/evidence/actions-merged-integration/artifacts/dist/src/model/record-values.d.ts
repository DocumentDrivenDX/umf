import { type Document, type Validation } from './types';
import { type CoreLiteral } from './schema-literals';
export interface CoreRecordValueIdentity {
    module: string;
    element: string;
}
export type CoreRecordFieldValue = {
    field: CoreRecordValueIdentity;
    state: 'absent';
} | {
    field: CoreRecordValueIdentity;
    state: 'present';
    value: CoreLiteral;
};
export interface CoreRecordValueCheck {
    operation: 'validate-core-record-values';
    version: '1.0.0';
    source: Document;
    identity: CoreRecordValueIdentity;
    values: CoreRecordFieldValue[];
    documentValidation: Validation;
    validation: Validation;
    fields: {
        field: CoreRecordValueIdentity;
        state: 'absent' | 'present';
        validation: Validation;
    }[];
}
/** Logical membership/presence/field checks, never native rows, defaults or dataset uniqueness. */
export declare function validateCoreRecordValues(input: Document, identityInput: CoreRecordValueIdentity, valuesInput: CoreRecordFieldValue[]): CoreRecordValueCheck;
