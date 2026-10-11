import { type Document, type Json, type Diagnostic, type Cardinality, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type CoreCardinalityDeclaration } from '../model/cardinality';
export declare const POSTGRESQL_CARDINALITY_EXTENSION = "umf.postgresql.cardinality";
export declare const postgresqlCardinalityPackage: ExtensionPackage;
export { default as postgresqlCardinalityClassificationSchema } from '../../spec/core/postgresql-cardinality-classification.schema.json';
export interface PostgresqlCardinalityRequest {
    column: string;
    nativeSource: string;
    supplement: string;
    mode: 'strict' | 'report';
    profile: 'stored-value' | 'unresolved';
    author?: CoreCardinalityDeclaration;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Retain original native archive and author assertions; classification does not replace native meaning';
export interface PostgresqlCardinalityClassification {
    operation: 'classify-postgresql-cardinality';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: PostgresqlCardinalityRequest;
    binding: typeof binding;
    mapping: {
        origin: 'classified';
        idealPath: string;
        nativePath: string;
        nativeFragment: NativeJson;
        cardinality: Cardinality;
        interpretation: 'declared' | 'unknown' | 'unsupported';
        outcome: 'exact' | 'approximated' | 'unknown' | 'not-expressible';
        basis: 'Explicit captured native type relationships; bounds, rank, item and execution semantics remain native';
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
export declare function classifyPostgresqlCardinality(input: Document, options: PostgresqlCardinalityRequest): PostgresqlCardinalityClassification;
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export declare function verifyPostgresqlCardinalityClassification(input: PostgresqlCardinalityClassification, current: Document): PostgresqlCardinalityClassification;
/** Recover both exact native texts, including unclaimed content. */
export declare function recoverPostgresqlCardinalitySource(input: PostgresqlCardinalityClassification, current: Document): {
    nativeSource: string;
    supplement: string;
};
