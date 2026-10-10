import { type Json, type Document, type Validation, type Element } from '../types';
import { type CoreLiteral } from '../schema-literals';
import { type CoreKeyIdentity, type CoreKeyTupleValue } from '../key-tuple';
import type { CoreRecordValueIdentity, CoreRecordFieldValue } from '../record-values';
import type { CoreDatasetInput } from '../dataset-values';
import type { CoreCompactRecordValueCheck, CoreCompactKeyTupleReceipt } from '../dataset-values-compact';
export declare class WorkExceeded extends Error {
}
export declare class ValueWork {
    used: number;
    categories: Record<string, number>;
    charge(category: string, visits: number): void;
    count(value: any): number;
    walk(category: string, value: any, multiplier?: number): number;
    copy(value: unknown): Json;
    snapshot(): {
        used: number;
        categories: {
            [x: string]: number;
        };
    };
}
/** Streaming exact UTF-8 JSON byte bound before any semantic validator. */
export declare function preflightBytes(value: any, work: ValueWork): number;
/** Constructor is internal; public compact APIs never accept contexts or a ledger. */
export declare function createValueContext(sourceInput: Document, inputInput: unknown, work?: ValueWork): {
    source: Document;
    input: CoreDatasetInput;
    documentValidation: Validation;
    work: ValueWork;
    record: (identity: CoreRecordValueIdentity, values: CoreRecordFieldValue[]) => CoreCompactRecordValueCheck;
    key: (identity: CoreKeyIdentity, values: CoreKeyTupleValue[]) => CoreCompactKeyTupleReceipt;
    reserveInput: () => void;
    copy: (v: unknown) => Json;
    literal: (doc: Document, field: Element, value: CoreLiteral) => void;
};
