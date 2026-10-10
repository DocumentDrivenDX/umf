import { type Document, type Json, type Diagnostic, type Nullability, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export declare const TABLESPEC_NULLABILITY_EXTENSION = "umf.tablespec.nullability";
export declare const tableSpecNullabilityPackage: ExtensionPackage;
export { default as tableSpecNullabilityClassificationSchema } from '../../spec/core/tablespec-nullability-classification.schema.json';
export interface TableSpecNullabilityRequest {
    column: number;
    mode: 'strict' | 'report';
    profile: 'runtime-model' | 'checked-schema' | 'unresolved';
    context: string | null;
    carrier: 'null-value' | 'unresolved';
    author?: CoreNullabilityDeclaration;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain the complete source and native archive; unknown native meaning is not replaced by the core label';
export interface TableSpecNullabilityClassification {
    operation: 'classify-tablespec-nullability';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: TableSpecNullabilityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: NativeJson;
        nullability: Nullability;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'unknown' | 'not-expressible';
        context: string | null;
        carrier: TableSpecNullabilityRequest['carrier'];
        basis: 'Native declaration under selected profile and context; not runtime coercion or row validation';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Read exact declarations under the caller's profile/context/carrier. Never use native coercion or defaults as ideal meaning. */
export declare function classifyTableSpecNullability(input: Document, options: TableSpecNullabilityRequest): TableSpecNullabilityClassification;
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export declare function verifyTableSpecNullabilityClassification(input: TableSpecNullabilityClassification, current: Document): TableSpecNullabilityClassification;
/** Recover exact original text or split files, including unclaimed native content. */
export declare function recoverTableSpecNullabilitySource(input: TableSpecNullabilityClassification, current: Document): string | Record<string, string>;
