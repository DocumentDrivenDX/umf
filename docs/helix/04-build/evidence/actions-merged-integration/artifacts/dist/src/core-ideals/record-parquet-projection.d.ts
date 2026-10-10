import { type Document, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type FieldParquetRequest, type FieldParquetProjection } from './field-parquet-projection';
export { default as recordParquetProjectionSchema } from '../../spec/core/record-parquet-projection.schema.json';
export interface RecordParquetRequest {
    id: string;
    recordName: string;
    mode: 'strict' | 'report';
    fields: {
        author: CoreKindDeclaration;
        fieldName: string;
        nativeType: FieldParquetRequest['nativeType'];
        repetition: FieldParquetRequest['repetition'];
    }[];
}
declare const binding: {
    readonly id: 'umf.core.record.parquet';
    readonly version: '1.0.0';
    readonly nativeVersion: 'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017';
    readonly subset: 'Authored flat record with explicit field carriers/repetition in an empty schema file; no row writing or value-domain equivalence';
};
export interface RecordParquetProjection {
    operation: 'project-record-parquet';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: RecordParquetRequest;
    binding: typeof binding;
    target?: Document;
    mappings: {
        origin: 'authored';
        kind: 'record' | 'field';
        idealPath: string;
        nativePath: string;
        outcome: 'exact' | 'unknown' | 'not-expressible';
    }[];
    residuals: FieldParquetProjection['residuals'];
    diagnostics: Diagnostic[];
}
export declare function projectRecordToParquet(input: CoreKindDeclaration, options: RecordParquetRequest): RecordParquetProjection;
export declare function recoverRecordFromParquet(input: RecordParquetProjection, nativeBytes: Uint8Array): Document;
