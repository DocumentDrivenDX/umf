import { type Document } from '../../model/types';
import type { PostgresqlBackend } from './index';
export { default as postgresqlKeyCatalogCorrelationSchema } from '../../../spec/core/postgresql-key-catalog-correlation.schema.json';
/** Correlate complete overlapping native observations. This does not authenticate
 * either source, prove a shared transaction snapshot, or establish ideal equality. */
export declare function correlatePostgresqlKeyCatalog(document: Document, text: string, backend: PostgresqlBackend): Promise<{
    nativeSupplement: string;
    root: import("../json-schema").NativeJson;
    nativeCatalog: string;
    matches: {
        identity: {
            schema: string;
            table: string;
            index: string;
        };
        relationPath: string;
        indexPath: string;
        componentPaths: (string | null)[];
    }[];
    sameSnapshotVerified: false;
    authenticated: false;
    idealEqualityVerified: false;
}>;
