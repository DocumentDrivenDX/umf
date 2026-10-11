import type { Document, Diagnostic } from '../../model/types';
export interface ParquetKeyValue {
    key: string;
    value?: string;
}
export interface ParquetMetadataTransform {
    source: Document;
    status: 'transformed' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    output?: Document;
    added?: ParquetKeyValue[];
    unchangedPrefixBytes?: number;
}
/** Append new file-level keys. Refuse replacement, unknown metadata, encryption and footer trailers. */
export declare function appendParquetKeyValueMetadata(source: Document, entries: ParquetKeyValue[]): ParquetMetadataTransform;
