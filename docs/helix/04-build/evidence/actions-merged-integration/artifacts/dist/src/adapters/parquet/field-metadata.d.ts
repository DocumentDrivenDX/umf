import { type Document, type Element, type Json, type Diagnostic } from '../../model/types';
export interface ParquetFieldMetadata {
    index: number;
    path: string[];
    definitionLevel: number;
    repetitionLevel: number;
    element: Element;
    nativeField: Json;
}
export interface ParquetFieldMetadataResult {
    status: 'checked' | 'blocked';
    complete: false;
    fields: ParquetFieldMetadata[];
    diagnostics: Diagnostic[];
}
/** Field domains only, not row shape, repetition flattening or instance validation. */
export declare function getParquetFieldMetadata(source: Document): ParquetFieldMetadataResult;
export declare function importParquetSchema(bytes: Uint8Array, options: {
    id: string;
}): Document;
export declare function checkParquetFieldMetadata(doc: Document): void;
/** Used after a verified native rewrite; preserve unrelated metadata by schema index. */
export declare function refreshParquetFieldMetadata(doc: Document): void;
