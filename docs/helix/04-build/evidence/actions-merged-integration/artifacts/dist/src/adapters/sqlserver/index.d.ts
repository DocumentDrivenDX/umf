import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type Element, type ExtensionPackage } from '../../model/types';
export declare const SQLSERVER_EXTENSION = "umf.sqlserver";
export declare const sqlserverPackage: ExtensionPackage;
export interface SqlServerColumnMetadata {
    path: string;
    table: {
        schema: string;
        name: string;
    };
    element: Element;
    nativeColumn: NativeJson;
}
export declare function sqlserverRegistry(): Registry;
export declare function inspectSqlServer(document: Document): import("../..").Validation;
export declare function getSqlServerColumnMetadata(document: Document): SqlServerColumnMetadata[];
export interface SqlServerConstraintMetadata {
    complete: false;
    tables: {
        path: string;
        table: {
            schema: string;
            name: string;
        };
        available: {
            keys: boolean;
            foreign_keys: boolean;
            checks: boolean;
        };
        keys: NativeJson[];
        foreign_keys: NativeJson[];
        checks: NativeJson[];
    }[];
}
/** Missing observations are distinct from empty, permission-limited catalog results. */
export declare function getSqlServerConstraintMetadata(document: Document): SqlServerConstraintMetadata;
export interface SqlServerIndexMetadata {
    complete: false;
    tables: {
        path: string;
        table: {
            schema: string;
            name: string;
        };
        available: boolean;
        indexes: NativeJson[];
    }[];
}
/** Preserve heap and all observed index rows; column ordinals do not imply portable keys. */
export declare function getSqlServerIndexMetadata(document: Document): SqlServerIndexMetadata;
export declare function importSqlServerCatalog(text: string, options: {
    id: string;
}): Document;
export declare function exportSqlServerCatalog(document: Document): string;
export declare function proposeSqlServerCatalogEdit(document: Document, path: string, text: string): Document;
