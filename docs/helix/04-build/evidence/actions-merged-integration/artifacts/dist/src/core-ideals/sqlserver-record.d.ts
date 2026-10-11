import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type SqlServerFieldClassification } from './sqlserver-field';
export { default as sqlserverRecordClassificationSchema } from '../../spec/core/sqlserver-record-classification.schema.json';
export interface SqlServerRecordRequest {
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
    readonly id: 'umf.sqlserver.catalog.record';
    readonly version: '1.0.0';
    readonly nativeVersion: '16.0.4295.3';
    readonly subset: 'Captured table member roles only; permission-limited observations, no native identity/constraint equivalence';
};
type Mapping = Omit<SqlServerFieldClassification['mapping'], 'kind' | 'basis'> & {
    kind: 'field' | 'record';
    basis: 'checked-catalog-column-membership' | 'checked-catalog-table-members';
};
export interface SqlServerRecordClassification {
    operation: 'classify-sqlserver-record';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: SqlServerRecordRequest;
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
export declare function classifySqlServerRecord(input: Document, options: SqlServerRecordRequest): SqlServerRecordClassification;
export declare function recoverSqlServerRecordCapture(input: SqlServerRecordClassification, current: Document): string;
