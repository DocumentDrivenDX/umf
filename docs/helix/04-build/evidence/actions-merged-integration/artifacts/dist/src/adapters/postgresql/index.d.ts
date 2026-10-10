import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type Json, type ExtensionPackage } from '../../model/types';
export declare const POSTGRESQL_EXTENSION = "umf.postgresql";
export declare const postgresqlPackage: ExtensionPackage;
export interface PostgresqlBackend {
    identity: '@libpg-query/parser@17.6.10';
    parse(sql: string): Promise<unknown>;
    deparse(tree: unknown): Promise<string>;
    codecRoundTrip(tree: unknown): unknown;
}
/** Validate the known native JSON vocabulary without removing unknown fields. */
export declare function validatePostgresqlAst(tree: unknown): {
    valid: boolean | Promise<unknown>;
    complete: boolean;
    errors: Json;
};
export declare function postgresqlRegistry(): Registry;
export declare function inspectPostgresql(document: Document): import("../..").Validation;
export declare function importPostgresqlSql(source: string, backend: PostgresqlBackend, options: {
    id: string;
}): Promise<Document>;
/** Original source archive; it deliberately remains the pre-edit source. */
export declare function getPostgresqlSource(document: Document): string;
export declare function getPostgresqlNode(document: Document, path: string): NativeJson;
export declare function proposePostgresqlNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
/** Regenerate SQL from the current AST, preserving the source archive separately. No SQL is executed. */
export declare function exportPostgresqlSql(document: Document, backend: PostgresqlBackend): Promise<string>;
