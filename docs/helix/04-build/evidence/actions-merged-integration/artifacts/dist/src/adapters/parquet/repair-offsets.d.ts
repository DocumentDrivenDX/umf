import type { Document, Diagnostic } from '../../model/types';
export interface ParquetOffsetRepair {
    source: Document;
    status: 'transformed' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    output?: Document;
    unchangedPrefixBytes?: number;
    repairs?: {
        rowGroup: number;
        column: number;
        oldDataOffset: number;
        dataOffset: number;
        dictionaryOffset: number;
    }[];
}
/** Explicit correction of a dictionary stored at data_page_offset with no dictionary offset. */
export declare function repairParquetDictionaryOffsets(source: Document): ParquetOffsetRepair;
