import { type NativeJson } from '../../model/native-json';
import { type Document } from '../../model/types';
declare const kinds: readonly ['parameter', 'header', 'response', 'request-body', 'example', 'link', 'security-scheme'];
export type OpenapiReferenceKind = typeof kinds[number];
export interface OpenapiReferenceRequest {
    pointer: string;
    kind: OpenapiReferenceKind;
    resourceUri?: string;
}
export interface OpenapiReferenceResolution {
    kind: OpenapiReferenceKind;
    target: {
        uri: string;
        pointer: string;
        node: NativeJson;
    };
    chain: {
        uri: string;
        pointer: string;
        reference: NativeJson;
    }[];
    effectiveAnnotations: {
        summary?: string;
        description?: string;
    };
    complete: false;
    limitations: string[];
}
/** Resolve a caller-declared Reference Object role, without inferring Schema Object scope. */
export declare function resolveOpenapiObjectReference(document: Document, input: OpenapiReferenceRequest): OpenapiReferenceResolution;
export {};
