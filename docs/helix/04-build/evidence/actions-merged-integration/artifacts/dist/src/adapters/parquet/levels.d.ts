import type { Document, Diagnostic } from '../../model/types';
export interface ParquetPageLevels {
    rowGroup: number;
    column: number;
    offset: number;
    repetition: number[];
    definition: number[];
    repetitionPadding: number[];
    definitionPadding: number[];
    valuesOffset: number;
    nonNullValues: number;
    rowStarts: number;
}
export interface ParquetLevels {
    source: Document;
    status: 'decoded' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    pages?: ParquetPageLevels[];
}
/** Decodes level streams only. Dictionary and physical value decoding remain separate. */
export declare function decodeParquetLevels(source: Document): ParquetLevels;
