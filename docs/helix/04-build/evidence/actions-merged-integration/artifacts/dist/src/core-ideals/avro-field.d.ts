import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as avroFieldClassificationSchema } from '../../spec/core/avro-field-classification.schema.json';
export interface AvroFieldRequest {
    column: string;
    nativeSource: string;
    dependencies?: {
        id: string;
        schema: string;
    }[];
    mode: 'strict' | 'report';
    author?: CoreKindDeclaration;
}
declare const binding: {
    readonly id: 'umf.avro.field';
    readonly version: '1.0.0';
    readonly nativeVersion: '1.12.0';
    readonly subset: 'Declared record/error field membership with named dependencies; logical refinements, presence and value-domain equivalence excluded';
};
export interface AvroFieldClassification {
    operation: 'classify-avro-field';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: AvroFieldRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        kind: 'field';
        idealPath: string;
        nativePath: string;
        dependencyId?: string;
        nativeFragment: Json;
        basis: 'checked-record-field-membership';
        outcome: 'exact' | 'unknown';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Original assertion and native fragment retained in source; reclassify with corrected provenance';
    }[];
    diagnostics: Diagnostic[];
}
/** Native paths are JSON pointers into the retained capture text, not pointers into the tagged UMF encoding. */
export declare function classifyAvroField(input: Document, options: AvroFieldRequest): AvroFieldClassification;
export declare function recoverAvroFieldBundle(input: AvroFieldClassification, current: Document): {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
};
