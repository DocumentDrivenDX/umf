import { type Document, type Diagnostic, type Validation, type Element } from '../types';
import type { CoreLiteral } from '../schema-literals';
import type { CoreRecordValueIdentity, CoreRecordFieldValue } from '../record-values';
export declare function evaluateRecordBody(source: Document, identity: CoreRecordValueIdentity, values: CoreRecordFieldValue[], documentValidation: Validation, validateField: (field: CoreRecordValueIdentity, value: CoreLiteral) => Validation, lookupField?: (identity: CoreRecordValueIdentity) => Element | undefined, hasRelationships?: boolean): {
    operation: 'validate-core-record-values';
    version: '1.0.0';
    identity: CoreRecordValueIdentity;
    values: CoreRecordFieldValue[];
    documentValidation: Validation;
    validation: {
        valid: boolean;
        complete: boolean;
        diagnostics: Diagnostic[];
    };
    fields: {
        field: CoreRecordValueIdentity;
        state: 'absent' | 'present';
        validation: Validation;
    }[];
};
