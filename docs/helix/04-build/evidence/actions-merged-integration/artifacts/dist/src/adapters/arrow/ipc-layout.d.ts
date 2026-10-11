import type { Document, Diagnostic } from '../../model/types';
export interface ArrowIpcFrame {
    offset: number;
    prefixLength: number;
    metadataOffset: number;
    metadataLength: number;
    bodyOffset: number;
    bodyLength: number;
    kind: string;
    metadata: Document;
}
export interface ArrowIpcLayout {
    source: Document;
    format: 'stream' | 'file';
    complete: false;
    bytesAccountedFor: boolean;
    frames: ArrowIpcFrame[];
    footer?: {
        offset: number;
        length: number;
        metadata: Document;
    };
    eosOffset?: number;
    consumed: number;
    trailingBytes: number;
    diagnostics: Diagnostic[];
}
/** Inspects encapsulated metadata/body boundaries; does not execute array or dictionary semantics. */
export declare function inspectArrowIpcLayout(document: Document): ArrowIpcLayout;
