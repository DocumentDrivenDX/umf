import { type Document, type Json, type Diagnostic, type Cardinality, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
export declare const SQLSERVER_CARDINALITY_EXTENSION = "umf.sqlserver.cardinality";
export declare const sqlserverCardinalityPackage: ExtensionPackage;
export { default as sqlserverCardinalityClassificationSchema } from '../../spec/core/sqlserver-cardinality-classification.schema.json';
export interface SqlServerCardinalityRequest {
    column: string;
    nativeSource: string;
    mode: 'strict' | 'report';
    profile: 'native-scalar' | 'json-array' | 'json-object' | 'unresolved';
    identity: {
        module: string;
        element: string;
    };
    constraint: string | null;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const basis: 'Explicit representation selection and pinned catalog constraint profile; physical column and logical Field remain distinct';
declare const recovery: 'Retain original native archive and author assertions; classification does not replace native meaning';
export interface SqlServerCardinalityClassification {
    operation: 'classify-sqlserver-cardinality';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: SqlServerCardinalityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: NativeJson;
        cardinality: Cardinality;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'approximated' | 'unknown' | 'not-expressible';
        basis: typeof basis;
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: typeof recovery;
    }[];
    diagnostics: Diagnostic[];
}
/** Create a separately identified logical Field; never relabel a native text column. */
export declare function classifySqlServerCardinality(input: Document, options: SqlServerCardinalityRequest): SqlServerCardinalityClassification;
export declare function verifySqlServerCardinalityClassification(input: SqlServerCardinalityClassification, current: Document): SqlServerCardinalityClassification & {
    [x: string]: {};
};
export declare function recoverSqlServerCardinalitySource(input: SqlServerCardinalityClassification, current: Document): string;
