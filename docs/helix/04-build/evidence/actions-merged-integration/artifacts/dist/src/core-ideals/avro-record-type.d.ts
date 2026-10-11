import { type Document } from '../model/types';
import { type AvroRecordClassification, type AvroRecordRequest } from './avro-record';
export { default as avroRecordTypeClassificationSchema } from '../../spec/core/avro-record-type-classification.schema.json';
export type AvroRecordTypeRequest = Omit<AvroRecordRequest, 'path' | 'dependencyId'> & {
    column: string;
};
declare const binding: {
    readonly id: 'umf.avro.record-type';
    readonly version: '1.0.0';
    readonly nativeVersion: '1.12.0';
    readonly subset: 'Direct record/error definitions and qualified named record references; unions and containers require separate bindings';
};
export interface AvroRecordTypeClassification extends Omit<AvroRecordClassification, 'operation' | 'binding' | 'request' | 'mappings'> {
    operation: 'classify-avro-record-type';
    binding: typeof binding;
    request: AvroRecordTypeRequest;
    mappings: (Omit<AvroRecordClassification['mappings'][number], 'kind' | 'basis'> & {
        kind: 'field' | 'record' | 'record-type';
        basis: 'checked-record-field-membership' | 'checked-record-declaration' | 'qualified-native-record-type';
    })[];
}
export declare function classifyAvroRecordType(input: Document, options: AvroRecordTypeRequest): AvroRecordTypeClassification;
export declare function recoverAvroRecordTypeBundle(input: AvroRecordTypeClassification, current: Document): {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
};
