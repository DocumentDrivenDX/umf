import { type Document, type Json, type Diagnostic } from '../model/types';
export { default as postgresqlCompositeClassificationSchema } from '../../spec/core/postgresql-composite-classification.schema.json';
export interface PostgresqlCompositeRequest {
    recordModule: string;
    recordId: string;
    mode: 'strict' | 'report';
    nativeSource: string;
    relation: {
        schema: string;
        name: string;
    };
}
declare const binding: {
    readonly id: 'umf.postgresql.catalog.composite';
    readonly version: '1.0.0';
    readonly nativeVersion: '17.4';
    readonly subset: 'Captured standalone composite member roles only; formatted attribute type names do not resolve scalar families or nested identities';
};
export interface PostgresqlCompositeClassification {
    operation: 'classify-postgresql-composite';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: PostgresqlCompositeRequest;
    binding: typeof binding;
    mappings: {
        origin: 'classified';
        kind: 'field' | 'record';
        idealPath: string;
        nativePath: string;
        nativeFragment: Json;
        basis: 'checked-catalog-composite' | 'checked-catalog-composite-attribute';
        outcome: 'exact' | 'unknown';
    }[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Source and native fragments retained; resolve conflict then recompute whole record classification';
    }[];
    diagnostics: Diagnostic[];
}
export declare function classifyPostgresqlComposite(input: Document, options: PostgresqlCompositeRequest): PostgresqlCompositeClassification;
export declare function recoverPostgresqlCompositeCapture(input: PostgresqlCompositeClassification, current: Document): string;
