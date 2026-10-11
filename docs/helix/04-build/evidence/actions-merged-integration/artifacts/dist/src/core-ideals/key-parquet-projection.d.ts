import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKeyDeclaration, type CoreRecordIdentity } from '../model/keys';
import type { ParquetFacetCarrier } from './parquet-facet-carrier';
export { default as keyParquetProjectionSchema } from '../../spec/core/key-parquet-projection.schema.json';
export interface KeyParquetRequest {
    id: string;
    record: CoreRecordIdentity;
    recordName: string;
    mode: 'strict' | 'report';
    columns: {
        field: CoreRecordIdentity;
        name: string;
        carrier: ParquetFacetCarrier;
        fieldId?: number;
    }[];
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover authored source from retained receipt; native import alone does not recover authored identity';
export interface KeyParquetProjection {
    operation: 'project-keys-parquet';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    authors: CoreKeyDeclaration[];
    request: KeyParquetRequest;
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
export declare function projectKeysToParquet(input: Document, authorInput: CoreKeyDeclaration[], options: KeyParquetRequest): KeyParquetProjection;
/** Recompute projection and match current native representation; not source authentication. */
export declare function verifyKeysParquetProjection(input: KeyParquetProjection, current: Document): KeyParquetProjection;
export declare function recoverKeysParquetIdeal(input: KeyParquetProjection, current: Document): Document;
