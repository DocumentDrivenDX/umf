import { type Json, type Element } from './types';
import { type CoreKeyDefinition } from '../validation/keys';
import { checkSchemaLiteral } from './schema-literals';
export interface CoreKeyIdentity {
    module: string;
    element: string;
    key: string;
}
export type CoreKeyTupleValue = {
    boolean: boolean;
} | {
    integerToken: string;
} | {
    decimalToken: string;
} | {
    string: string;
} | {
    binaryHex: string;
};
export interface CoreKeyTupleReceipt {
    operation: 'encode-core-key-tuple';
    version: '3.0.0';
    profile: 'umf-key-tuple-v1';
    source: Json;
    identity: CoreKeyIdentity;
    values: CoreKeyTupleValue[];
    keyPath: string;
    bytesHex: string;
}
/** Exact current-core encoding; no native uniqueness or author provenance is inferred. */
export declare function encodeCoreKeyTuple(input: unknown, identityInput: CoreKeyIdentity, valuesInput: CoreKeyTupleValue[]): CoreKeyTupleReceipt;
/** Internal shared encoder; not exported from the package API. */
export declare function encodeCoreKeyTupleBody(source: Json, identity: CoreKeyIdentity, values: CoreKeyTupleValue[], validation: import('./types').Validation, checkLiteral?: typeof checkSchemaLiteral, selection?: {
    record: Element;
    recordPath: string;
    key: CoreKeyDefinition;
    keyPath: string;
    fields: {
        field: Element;
        path: string;
        member: string;
    }[];
}): {
    operation: 'encode-core-key-tuple';
    version: '3.0.0';
    profile: 'umf-key-tuple-v1';
    identity: CoreKeyIdentity;
    values: CoreKeyTupleValue[];
    keyPath: string;
    bytesHex: string;
};
export declare function verifyCoreKeyTuple(input: CoreKeyTupleReceipt, current: unknown): CoreKeyTupleReceipt;
export declare function readCoreKeyTupleBytes(input: CoreKeyTupleReceipt, current: unknown): Uint8Array;
