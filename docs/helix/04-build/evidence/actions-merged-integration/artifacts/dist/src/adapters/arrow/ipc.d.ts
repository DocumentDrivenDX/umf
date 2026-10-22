import { type Document } from '../../model/types';
export interface ArrowSchemaIpcBackend {
    identity: 'apache-arrow@21.2.0';
    encode(schema: unknown): {
        before: unknown;
        after: unknown;
        bytes: Uint8Array;
    };
}
/** Schema-only IPC stream. Does not export arrays, dictionary values or arbitrary IPC. */
export declare function exportArrowSchemaIpc(document: Document, backend: ArrowSchemaIpcBackend): Uint8Array;
