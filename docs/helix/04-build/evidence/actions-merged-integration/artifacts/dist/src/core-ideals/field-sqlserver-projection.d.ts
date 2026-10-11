import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as fieldSqlServerProjectionSchema } from '../../spec/core/field-sqlserver-projection.schema.json';
import { sqlServerCarriers as carriers } from './sqlserver-syntax';
export interface FieldSqlServerRequest {
    id: string;
    namespace: string;
    tableName: string;
    columnName: string;
    nativeType: keyof typeof carriers;
    mode: 'strict' | 'report';
}
declare const binding: {
    readonly id: 'umf.core.field.sqlserver';
    readonly version: '1.0.0';
    readonly nativeVersion: '16.0.4295.3';
    readonly subset: 'Single authored Field to permanent table DDL with explicit builtin carrier and nullable column; no value-domain or constraint equivalence';
};
export interface FieldSqlServerProjection {
    operation: 'project-field-sqlserver';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: FieldSqlServerRequest;
    target?: {
        format: 'sqlserver-ddl';
        sql: string;
    };
    nativeSql?: string;
    diagnostics: Diagnostic[];
    binding: typeof binding;
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: '/sql';
        outcome: 'exact' | 'unknown' | 'not-expressible';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible';
        recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
    }[];
}
export declare function projectFieldToSqlServer(input: CoreKindDeclaration, options: FieldSqlServerRequest): FieldSqlServerProjection;
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverFieldFromSqlServer(input: FieldSqlServerProjection, nativeText: string): Document;
