import { parquetCarriers } from './parquet-carriers';
import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as fieldParquetProjectionSchema } from '../../spec/core/field-parquet-projection.schema.json';
export interface FieldParquetRequest {
    id: string;
    recordName: string;
    repetition: 'required' | 'optional' | 'repeated';
    fieldName: string;
    nativeType: keyof typeof parquetCarriers;
    mode: 'strict' | 'report';
}
declare const binding: {
    readonly id: 'umf.core.field.parquet';
    readonly version: '1.0.0';
    readonly nativeVersion: 'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017';
    readonly subset: 'Single authored Field, explicit carrier and repetition in an empty schema file; no row writing or value-domain equivalence';
};
export interface FieldParquetProjection {
    operation: 'project-field-parquet';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: FieldParquetRequest;
    target?: Document;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: '/schema/1';
        outcome: 'exact' | 'unknown' | 'not-expressible';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible';
        recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
    }[];
}
export declare function projectFieldToParquet(input: CoreKindDeclaration, options: FieldParquetRequest): FieldParquetProjection & {
    diagnostics: Diagnostic[];
};
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverFieldFromParquet(input: FieldParquetProjection, nativeBytes: Uint8Array): Document;
