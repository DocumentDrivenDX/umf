import { type Document, type Json, type Diagnostic, type Cardinality, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreCardinalityDeclaration } from '../model/cardinality';
export declare const TABLESPEC_CARDINALITY_EXTENSION = "umf.tablespec.cardinality";
export declare const tableSpecCardinalityPackage: ExtensionPackage;
export { default as tableSpecCardinalityClassificationSchema } from '../../spec/core/tablespec-cardinality-classification.schema.json';
export interface TableSpecCardinalityRequest {
    column: number;
    mode: 'strict' | 'report';
    profile: 'runtime-model' | 'checked-schema' | 'unresolved';
    author?: CoreCardinalityDeclaration;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain original native archive and author assertions; classification does not replace native meaning';
export interface TableSpecCardinalityClassification {
    operation: 'classify-tablespec-cardinality';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: TableSpecCardinalityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: NativeJson;
        cardinality: Cardinality;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'unknown' | 'not-expressible';
        basis: 'Explicit native data_type and uncoerced dimension under selected metadata profile; item and execution semantics remain native';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Classify declared column shape only. Retain vector/item/runtime refinements in the native archive. */
export declare function classifyTableSpecCardinality(input: Document, options: TableSpecCardinalityRequest): TableSpecCardinalityClassification;
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export declare function verifyTableSpecCardinalityClassification(input: TableSpecCardinalityClassification, current: Document): TableSpecCardinalityClassification;
/** Recover exact original text or split files, including unclaimed native content. */
export declare function recoverTableSpecCardinalitySource(input: TableSpecCardinalityClassification, current: Document): string | Record<string, string>;
