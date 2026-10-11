import { type Document, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type FieldAvroRequest, type FieldAvroProjection } from './field-avro-projection';
export { default as recordAvroProjectionSchema } from '../../spec/core/record-avro-projection.schema.json';
export interface RecordAvroRequest {
    id: string;
    recordName: string;
    namespace: string;
    mode: 'strict' | 'report';
    fields: {
        author: CoreKindDeclaration;
        fieldName: string;
        nativeType: FieldAvroRequest['nativeType'];
    }[];
}
declare const binding: {
    readonly id: 'umf.core.record.avro';
    readonly version: '1.0.0';
    readonly nativeVersion: '1.12.0';
    readonly subset: 'Authored flat record with explicit primitive/logical field carriers; no presence, execution or value-domain equivalence';
};
export interface RecordAvroProjection {
    operation: 'project-record-avro';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: RecordAvroRequest;
    binding: typeof binding;
    target?: Document;
    mappings: {
        origin: 'authored';
        kind: 'record' | 'field';
        idealPath: string;
        nativePath: string;
        outcome: 'exact' | 'unknown' | 'not-expressible';
    }[];
    residuals: FieldAvroProjection['residuals'];
    diagnostics: Diagnostic[];
}
export declare function projectRecordToAvro(input: CoreKindDeclaration, options: RecordAvroRequest): RecordAvroProjection;
export declare function recoverRecordFromAvro(input: RecordAvroProjection, nativeText: string): Document;
