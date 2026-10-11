import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type PostgresqlFieldClassification } from './postgresql-field';
export { default as postgresqlRecordClassificationSchema } from '../../spec/core/postgresql-record-classification.schema.json';
export interface PostgresqlRecordRequest {
    recordModule: string;
    recordId: string;
    mode: 'strict' | 'report';
    nativeSource: string;
    relation: {
        schema: string;
        name: string;
    };
    authors?: CoreKindDeclaration[];
}
declare const binding: {
    readonly id: 'umf.postgresql.catalog.record';
    readonly version: '1.0.0';
    readonly nativeVersion: '17.4';
    readonly subset: 'Captured ordinary/partitioned table member roles; views, composites, raw DDL and execution equivalence excluded';
};
type Mapping = Omit<PostgresqlFieldClassification['mapping'], 'kind' | 'basis'> & {
    kind: 'field' | 'record';
    basis: 'checked-catalog-column-membership' | 'checked-catalog-table-members';
};
export interface PostgresqlRecordClassification {
    operation: 'classify-postgresql-record';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: PostgresqlRecordRequest;
    binding: typeof binding;
    mappings: Mapping[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Source and native fragments retained; resolve conflict then recompute whole record classification';
    }[];
    diagnostics: Diagnostic[];
}
export declare function classifyPostgresqlRecord(input: Document, options: PostgresqlRecordRequest): PostgresqlRecordClassification;
export declare function recoverPostgresqlRecordCapture(input: PostgresqlRecordClassification, current: Document): string;
