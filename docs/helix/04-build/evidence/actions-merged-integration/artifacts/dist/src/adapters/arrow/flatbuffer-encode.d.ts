import { type Document } from '../../model/types';
export interface ArrowFlatbufferEncodingBackend {
    identity: 'flatbuffers@25.9.23';
    encode(model: unknown): Uint8Array;
}
/** Encodes one logical metadata root. Never rewrites an archived IPC dataset. */
export declare function encodeArrowFlatbuffer(document: Document, backend: ArrowFlatbufferEncodingBackend): Uint8Array;
