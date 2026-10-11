import { type NativeJson } from '../../model/native-json';
import { type Document, type Diagnostic, type Element } from '../../model/types';
export interface PostgresqlDdlColumn {
    path: string;
    element: Element;
    typeResolution: 'builtin-syntax' | 'unresolved';
    nativeColumn: NativeJson;
}
export interface PostgresqlDdlDeclaration {
    path: string;
    statementIndex: number;
    kind: 'create-table' | 'create-foreign-table' | 'alter-table' | 'create-composite';
    schemaContext: string | null;
    requiresCatalogExpansion: boolean;
    relation: NativeJson;
    columns: PostgresqlDdlColumn[];
    nativeStatement: NativeJson;
}
export interface PostgresqlDdlDeclarations {
    status: 'observed' | 'blocked';
    complete: false;
    declarations: PostgresqlDdlDeclaration[];
    unhandled: {
        path: string;
        nativeStatement: NativeJson;
    }[];
    diagnostics: Diagnostic[];
}
/** Declaration inventory, never an executed catalog or replay of DDL state changes. */
export declare function getPostgresqlDdlDeclarations(document: Document): PostgresqlDdlDeclarations;
