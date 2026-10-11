import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKeyDeclaration, type CoreRecordIdentity } from '../model/keys';
export { default as keyTableSpecProjectionSchema } from '../../spec/core/key-tablespec-projection.schema.json';
export interface KeyTableSpecRequest {
    id: string;
    record: CoreRecordIdentity;
    tableName: string;
    mode: 'strict' | 'report';
    columns: {
        field: CoreRecordIdentity;
        name: string;
        nativeType: 'BOOLEAN' | 'INTEGER' | 'DECIMAL' | 'TEXT' | 'VARCHAR' | 'CHAR' | 'FLOAT' | 'DATE' | 'DATETIME' | 'TIMESTAMP';
    }[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover authored source from retained receipt; native import alone does not recover authored identity';
export interface KeyTableSpecProjection {
    operation: 'project-keys-tablespec';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    authors: CoreKeyDeclaration[];
    request: KeyTableSpecRequest;
    binding: typeof binding;
    target?: Document;
    mappings: {
        keyId: string;
        keyName: string;
        idealPath: string;
        nativePath: string;
        columns: string[];
        primary: boolean;
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
export declare function projectKeysToTableSpec(input: Document, authorInput: CoreKeyDeclaration[], options: KeyTableSpecRequest): KeyTableSpecProjection;
/** Recompute projection and match current native representation; not source authentication. */
export declare function verifyKeysTableSpecProjection(input: KeyTableSpecProjection, current: Document): KeyTableSpecProjection;
export declare function recoverKeysTableSpecIdeal(input: KeyTableSpecProjection, current: Document): Document;
