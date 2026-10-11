import { type Document, type Validation, type Json } from './types';
import { type CoreRecordValueIdentity, type CoreRecordFieldValue, type CoreRecordValueCheck } from './record-values';
import { type CoreKeyIdentity, type CoreKeyTupleValue, type CoreKeyTupleReceipt } from './key-tuple';
import operationSchema from '../../spec/core/dataset-value-operation.schema.json';
export { operationSchema as coreDatasetValueOperationSchema };
export interface CoreDatasetRecord {
    instanceId: string;
    identity: CoreRecordValueIdentity;
    values: CoreRecordFieldValue[];
}
export interface CoreDatasetRelationship {
    instanceId: string;
    identity: {
        module: string;
        id: string;
    };
    sourceInstanceId: string;
    target: {
        identity: CoreKeyIdentity;
        values: CoreKeyTupleValue[];
    };
}
export interface CoreDatasetInput {
    scope: {
        id: string;
        closure: 'supplied-dataset-only';
    };
    records: CoreDatasetRecord[];
    relationships: CoreDatasetRelationship[];
    context?: Json;
}
export interface CoreDatasetValueCheck {
    operation: 'validate-core-dataset-values';
    version: '1.0.0';
    scope: 'supplied-dataset-only';
    provenance: 'unverified';
    source: Document;
    input: CoreDatasetInput;
    documentValidation: Validation;
    records: {
        instanceId: string;
        result: CoreRecordValueCheck;
    }[];
    keys: {
        instanceId: string;
        result: CoreKeyTupleReceipt;
    }[];
    relationships: {
        instanceId: string;
        identity: {
            module: string;
            id: string;
        };
        sourceInstanceId: string;
        targetInstanceId: string;
        targetKey: CoreKeyTupleReceipt;
    }[];
    datasetValidation: Validation;
    obligations: {
        id: 'dataset.keys' | 'dataset.relationships';
        state: 'satisfied' | 'invalid' | 'unresolved';
        scope: 'supplied-dataset-only';
    }[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
    }[];
}
/** Finite supplied dataset only; no global/native coverage or execution authority. */
export declare function validateCoreDatasetValues(sourceInput: Document, inputInput: CoreDatasetInput): CoreDatasetValueCheck;
/** Internal shared composition; not exported from the package API. */
export declare function composeCoreDatasetValues(sourceInput: Document, inputInput: CoreDatasetInput, compact?: ReturnType<typeof import('./internal/value-context').createValueContext>): any;
export declare function verifyCoreDatasetValues(receiptInput: CoreDatasetValueCheck, current: Document, expectedInput: CoreDatasetInput): CoreDatasetValueCheck;
