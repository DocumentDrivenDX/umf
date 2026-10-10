import { type Document } from './types';
import type { CoreRecordValueCheck } from './record-values';
import type { CoreKeyTupleReceipt } from './key-tuple';
import { type CoreDatasetInput, type CoreDatasetValueCheck } from './dataset-values';
import { ValueWork } from './internal/value-context';
import operationSchema from '../../spec/core/dataset-value-compact-operation.schema.json';
export { operationSchema as coreDatasetValueCompactOperationSchema };
export type CoreCompactRecordValueCheck = Omit<CoreRecordValueCheck, 'source'> & {
    sourceRef: '#/source';
};
export type CoreCompactKeyTupleReceipt = Omit<CoreKeyTupleReceipt, 'source'> & {
    sourceRef: '#/source';
};
export interface CoreDatasetCompactValueCheck extends Omit<CoreDatasetValueCheck, 'operation' | 'records' | 'keys' | 'relationships'> {
    operation: 'validate-core-dataset-values-compact';
    records: {
        instanceId: string;
        result: CoreCompactRecordValueCheck;
    }[];
    keys: {
        instanceId: string;
        result: CoreCompactKeyTupleReceipt;
    }[];
    relationships: {
        instanceId: string;
        identity: {
            module: string;
            id: string;
        };
        sourceInstanceId: string;
        targetInstanceId: string;
        targetKey: CoreCompactKeyTupleReceipt;
    }[];
}
/** Internal accounting receipt for tests, not exported from package API. */
export declare function evaluateCompactWithWork(source: Document, input: CoreDatasetInput, work?: ValueWork): {
    receipt: CoreDatasetCompactValueCheck & {
        [x: string]: {};
    };
    work: {
        used: number;
        categories: {
            [x: string]: number;
        };
    };
};
export declare function validateCoreDatasetValuesCompact(source: Document, input: CoreDatasetInput): CoreDatasetCompactValueCheck;
export declare function verifyCoreDatasetValuesCompact(receiptInput: CoreDatasetCompactValueCheck, current: Document, expectedInput: CoreDatasetInput): CoreDatasetCompactValueCheck;
/** Internal accounting receipt for tests, not exported from package API. */
export declare function verifyCompactWithWork(receiptInput: CoreDatasetCompactValueCheck, current: Document, expectedInput: CoreDatasetInput): {
    receipt: CoreDatasetCompactValueCheck;
    work: {
        used: number;
        categories: {
            [x: string]: number;
        };
    };
};
