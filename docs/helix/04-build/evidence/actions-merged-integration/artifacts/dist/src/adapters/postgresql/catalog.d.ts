export type { PostgresqlColumnMetadata } from './column-metadata';
import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const POSTGRESQL_CATALOG_EXTENSION = "umf.postgresql.catalog";
export declare const postgresqlCatalogPackage: ExtensionPackage;
export declare function postgresqlCatalogRegistry(): Registry;
export declare function inspectPostgresqlCatalog(document: Document): import("../..").Validation;
export declare function importPostgresqlCatalogCapture(text: string, options: {
    id: string;
}): Document;
export declare function getPostgresqlColumnMetadata(document: Document): import("./column-metadata").PostgresqlColumnMetadata[];
/** Export the entire native capture, preserving unknown fields and exact numbers. */
export declare function exportPostgresqlCatalogCapture(document: Document): {
    state: "captured" | "modified";
    json: string;
    complete: false;
};
export declare function getPostgresqlCatalogNode(document: Document, path: string): NativeJson;
/** Returns native observations, including unknown fields; no entity/table equivalence. */
export declare function findPostgresqlCatalogRelation(document: Document, qualified: {
    schema: string;
    name: string;
}): NativeJson | undefined;
export declare function proposePostgresqlCatalogEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
/** Original archive only; the caller must still verify correspondence and server prerequisites. */
export declare function getPostgresqlCatalogReconstruction(document: Document): {
    sql: string;
    complete: false;
    provenance: 'original-capture-archive';
};
export interface PostgresqlCatalogObjectIdentity {
    catalog: string;
    type: string;
    identity: string;
}
/** Observed pg_depend edges only. Missing coverage is distinct from no matches.
 * Native dependency kinds and multiplicity are retained; this is not a DDL plan. */
export declare function queryPostgresqlCatalogDependencies(document: Document, filter?: {
    side: 'dependent' | 'referenced';
    object: PostgresqlCatalogObjectIdentity;
}): {
    available: boolean;
    complete: false;
    state: "captured" | "modified";
    edges: NativeJson[];
};
