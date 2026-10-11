import type { Document, Diagnostic, Json } from '../../model/types';
export declare const PARQUET_PAGE_LIMITS: {
    readonly headerBytes: 65536;
    readonly pages: 10000;
    readonly pageBytes: number;
    readonly totalBytes: number;
    readonly pageValues: 100000;
    readonly totalValues: 1000000;
    readonly rows: 10000;
};
export interface ParquetPage {
    rowGroup: number;
    column: number;
    offset: number;
    headerBytes: number;
    bodyOffset: number;
    bodyBytes: number;
    header: Json;
}
export interface ParquetPageInspection {
    source: Document;
    status: 'checked' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    pages?: ParquetPage[];
    declaredUncompressedBytes?: number;
    declaredValues?: number;
}
/** Validates declared page boundaries/budgets without decompressing or decoding data. */
export declare function inspectParquetPages(source: Document): ParquetPageInspection;
