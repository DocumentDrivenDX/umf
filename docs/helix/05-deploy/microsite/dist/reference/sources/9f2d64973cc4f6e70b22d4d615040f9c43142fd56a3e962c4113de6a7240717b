// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreKindDeclaration} from '../model/field-kind';
import type {ParquetRecordClassification,ParquetRecordRequest} from './parquet-record';
export {default as parquetRecordTypeClassificationSchema} from '../../spec/core/parquet-record-type-classification.schema.json';
export interface ParquetRecordTypeRequest extends ParquetRecordRequest {fieldAuthor?:CoreKindDeclaration}
const binding={id:'umf.parquet.record-type',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Non-root interpreted struct-valued members; native repetition retained, LIST/MAP wrappers excluded'} as const;
export interface ParquetRecordTypeClassification extends Omit<ParquetRecordClassification,'operation'|'binding'|'request'|'mappings'>{operation:'classify-parquet-record-type';binding:typeof binding;request:ParquetRecordTypeRequest;mappings:(Omit<ParquetRecordClassification['mappings'][number],'kind'|'basis'>&{kind:'field'|'record'|'record-type';basis:'checked-record-field-membership'|'checked-record-declaration'|'checked-struct-valued-member'})[]}
