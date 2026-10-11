import { type NativeJson } from '../../model/native-json';
import { type Document } from '../../model/types';
export interface PostgresqlTypeIdentity {
    schema: string;
    name: string;
}
interface ObservedType {
    identity: PostgresqlTypeIdentity;
    kind: string;
    category: string;
    element: PostgresqlTypeIdentity | null;
    base: PostgresqlTypeIdentity | null;
    standardArray: boolean;
}
/** Validate the bounded supplement without interpreting unknown native content.
 * The original text and exact-token tree remain authoritative, not the host view.
 * This does not establish correspondence with a separately captured catalog.
 */
export declare function inspectPostgresqlCardinalityCatalog(text: string): {
    nativeSource: string;
    root: NativeJson;
    serverVersion: number;
    qualifiedVersion: boolean;
    columns: {
        schema: string;
        relation: string;
        name: string;
        ordinal: number;
        declaredDimensions: number;
        type: PostgresqlTypeIdentity;
    }[];
    types: {
        identity: PostgresqlTypeIdentity;
        kind: string;
        category: string;
        element: PostgresqlTypeIdentity | null;
        base: PostgresqlTypeIdentity | null;
        standardArray: boolean;
    }[];
};
/** Resolve domain bases only. Category A and formatted names never imply arrays.
 * The result describes native relationships, not ideal admission or enforcement.
 */
export declare function resolvePostgresqlCardinalityType(text: string, column: {
    schema: string;
    relation: string;
    name: string;
}): {
    nativeSource: string;
    root: NativeJson;
    qualifiedVersion: boolean;
    column: {
        schema: string;
        relation: string;
        name: string;
        ordinal: number;
        declaredDimensions: number;
        type: PostgresqlTypeIdentity;
    };
    domains: ObservedType[];
    native: {
        identity: PostgresqlTypeIdentity;
        kind: string;
        category: string;
        element: PostgresqlTypeIdentity | null;
        base: PostgresqlTypeIdentity | null;
        standardArray: boolean;
    };
    element: {
        identity: PostgresqlTypeIdentity;
        kind: string;
        category: string;
        element: PostgresqlTypeIdentity | null;
        base: PostgresqlTypeIdentity | null;
        standardArray: boolean;
    } | null;
    standardArray: boolean;
};
/** Cross-check overlapping observations. Agreement is not proof of a shared
 * database snapshot; capture provenance must establish that separately. */
export declare function correlatePostgresqlCardinalityCatalog(document: Document, text: string): {
    matches: {
        column: string;
        path: string;
        identity: {
            schema: string;
            relation: string;
            name: string;
        };
        type: PostgresqlTypeIdentity;
    }[];
    qualifiedVersion: boolean;
    sameSnapshotVerified: false;
    nativeSupplement: string;
};
export {};
