// SPDX-License-Identifier: MIT OR Apache-2.0
import type {AvroRecordClassification,AvroRecordRequest} from './avro-record';
export {default as avroRecordTypeClassificationSchema} from '../../spec/core/avro-record-type-classification.schema.json';
export type AvroRecordTypeRequest=Omit<AvroRecordRequest,'path'|'dependencyId'>&{column:string};
const binding={id:'umf.avro.record-type',version:'1.0.0',nativeVersion:'1.12.0',subset:'Direct record/error definitions and qualified named record references; unions and containers require separate bindings'} as const;
export interface AvroRecordTypeClassification extends Omit<AvroRecordClassification,'operation'|'binding'|'request'|'mappings'>{operation:'classify-avro-record-type';binding:typeof binding;request:AvroRecordTypeRequest;mappings:(Omit<AvroRecordClassification['mappings'][number],'kind'|'basis'>&{kind:'field'|'record'|'record-type';basis:'checked-record-field-membership'|'checked-record-declaration'|'qualified-native-record-type'})[]}
