import { type Document, type Json, type Diagnostic, type Cardinality, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type AvroTypeLocation } from './avro-cardinality-type';
export declare const AVRO_CARDINALITY_EXTENSION = "umf.avro.cardinality";
export declare const avroCardinalityPackage: ExtensionPackage;
export { default as avroCardinalityClassificationSchema } from '../../spec/core/avro-cardinality-classification.schema.json';
export interface AvroCardinalityRequest {
    column: string;
    nativeSource: string;
    dependencies?: {
        id: string;
        schema: string;
    }[];
    identity: {
        module: string;
        element: string;
    };
    profile: 'present-non-null-schema' | 'unresolved';
    mode: 'strict' | 'report';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
}, basis: string;
declare const recovery: 'Retain original native archive and author assertions; classification does not replace native meaning';
interface Node {
    identity: {
        module: string;
        element: string;
    };
    location: AvroTypeLocation;
    nativeFragment: NativeJson;
    cardinality: Cardinality;
    interpretation: 'declared' | 'unknown' | 'unsupported';
    nativeAllowsNull: boolean | null;
    definitions: AvroTypeLocation[];
}
export interface AvroCardinalityClassification {
    operation: 'classify-avro-cardinality';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: AvroCardinalityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        cardinality: Cardinality;
        outcome: 'exact' | 'unknown' | 'not-expressible';
        basis: typeof basis;
        nodes: Node[];
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Schema classification creates logical identities; native metadata and codec semantics remain intact. */
export declare function classifyAvroCardinality(input: Document, options: AvroCardinalityRequest): AvroCardinalityClassification;
/** Consistency checking, not receipt authentication. */
export declare function verifyAvroCardinalityClassification(input: AvroCardinalityClassification, current: Document): AvroCardinalityClassification & {
    [x: string]: {};
};
export declare function recoverAvroCardinalityBundle(input: AvroCardinalityClassification, current: Document): {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
};
