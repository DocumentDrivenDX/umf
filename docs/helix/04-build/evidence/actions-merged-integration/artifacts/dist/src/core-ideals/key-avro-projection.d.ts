import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKeyDeclaration, type CoreRecordIdentity } from '../model/keys';
export { default as keyAvroProjectionSchema } from '../../spec/core/key-avro-projection.schema.json';
export interface KeyAvroRequest {
    id: string;
    record: CoreRecordIdentity;
    recordName: string;
    namespace: string;
    mode: 'strict' | 'report';
    columns: {
        field: CoreRecordIdentity;
        name: string;
        nativeType: 'boolean' | 'int' | 'long' | 'bytes' | 'string' | 'float' | 'double' | 'decimal-bytes';
    }[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover authored source from retained receipt; native import alone does not recover authored identity';
export interface KeyAvroProjection {
    operation: 'project-keys-avro';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    authors: CoreKeyDeclaration[];
    request: KeyAvroRequest;
    binding: typeof binding;
    target?: Document;
    mappings: {
        keyId: string;
        keyName: string;
        idealPath: string;
        nativePaths: string[];
        columns: string[];
        primary: boolean;
        origin: 'authored';
        enforcement: 'not-expressible';
        outcome: 'not-expressible';
    }[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible';
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Consume verified declarations by stable ID. Native names never supply authored identity. */
export declare function projectKeysToAvro(input: Document, authorInput: CoreKeyDeclaration[], options: KeyAvroRequest): KeyAvroProjection;
/** Recompute projection and match current native representation; not source authentication. */
export declare function verifyKeysAvroProjection(input: KeyAvroProjection, current: Document): KeyAvroProjection;
export declare function recoverKeysAvroIdeal(input: KeyAvroProjection, current: Document): Document;
