import { avroCarriers } from './avro-carriers';
import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as fieldAvroProjectionSchema } from '../../spec/core/field-avro-projection.schema.json';
export interface FieldAvroRequest {
    id: string;
    recordName: string;
    namespace: string;
    fieldName: string;
    nativeType: keyof typeof avroCarriers;
    mode: 'strict' | 'report';
}
declare const binding: {
    readonly id: 'umf.core.field.avro';
    readonly version: '1.0.0';
    readonly nativeVersion: '1.12.0';
    readonly subset: 'Single authored Field with explicit primitive/logical carrier in a record; no presence, execution or value-domain equivalence';
};
export interface FieldAvroProjection {
    operation: 'project-field-avro';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: FieldAvroRequest;
    target?: Document;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: '/fields/0';
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
export declare function projectFieldToAvro(input: CoreKindDeclaration, options: FieldAvroRequest): FieldAvroProjection & {
    diagnostics: Diagnostic[];
};
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverFieldFromAvro(input: FieldAvroProjection, nativeText: string): Document;
