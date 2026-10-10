import { type Document, type Diagnostic } from '../../model/types';
export type ArrowFlatbufferRoot = 'Schema' | 'Message' | 'Footer' | 'Tensor' | 'SparseTensor';
/** Decodes a raw, non-size-prefixed FlatBuffer metadata root, not an IPC container. */
export declare function decodeArrowFlatbuffer(bytes: Uint8Array, options: {
    id: string;
    rootType: ArrowFlatbufferRoot;
}): {
    source: Document;
    model?: Document;
    complete: false;
    status: 'decoded' | 'uninterpreted';
    diagnostics: Diagnostic[];
};
