import { type NativeJson } from '../../model/native-json';
import { type Document, type Json } from '../../model/types';
import type { PostgresqlBackend } from './index';
import { inspectResolvedFacetPredicate } from './facet-resolved-predicate';
type Obj = Record<string, Json>;
export declare function inspectPostgresqlFacetCatalog(text: string): {
    root: NativeJson;
    nativeSource: string;
    serverVersion: number;
    encoding: string;
    constraints: Obj[];
};
/** Verify overlapping observations, including complete table-CHECK coverage.
 * This is a consistency check, not authentication or same-snapshot provenance.
 * All original source text, unknown properties and exact numbers are retained. */
export declare function correlatePostgresqlFacetCatalog(document: Document, text: string, datumFormat: string, backend: PostgresqlBackend): Promise<{
    nativeSupplement: string;
    root: NativeJson;
    nativeCatalog: string;
    matches: {
        identity: {
            schema: string;
            relation: string;
            constraint: string;
        };
        columns: {
            name: string;
            path: string;
        }[];
        inspection: ReturnType<typeof inspectResolvedFacetPredicate>;
    }[];
    sameSnapshotVerified: false;
    authenticated: false;
}>;
export {};
