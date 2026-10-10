import { type Document } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type ParquetRecordClassification, type ParquetRecordRequest } from './parquet-record';
export { default as parquetRecordTypeClassificationSchema } from '../../spec/core/parquet-record-type-classification.schema.json';
export interface ParquetRecordTypeRequest extends ParquetRecordRequest {
    fieldAuthor?: CoreKindDeclaration;
}
declare const binding: {
    readonly id: 'umf.parquet.record-type';
    readonly version: '1.0.0';
    readonly nativeVersion: 'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017';
    readonly subset: 'Non-root interpreted struct-valued members; native repetition retained, LIST/MAP wrappers excluded';
};
export interface ParquetRecordTypeClassification extends Omit<ParquetRecordClassification, 'operation' | 'binding' | 'request' | 'mappings'> {
    operation: 'classify-parquet-record-type';
    binding: typeof binding;
    request: ParquetRecordTypeRequest;
    mappings: (Omit<ParquetRecordClassification['mappings'][number], 'kind' | 'basis'> & {
        kind: 'field' | 'record' | 'record-type';
        basis: 'checked-record-field-membership' | 'checked-record-declaration' | 'checked-struct-valued-member';
    })[];
}
export declare function classifyParquetRecordType(input: Document, options: ParquetRecordTypeRequest): ParquetRecordTypeClassification;
export declare function recoverParquetRecordTypeBytes(input: ParquetRecordTypeClassification, current: Document): Uint8Array;
