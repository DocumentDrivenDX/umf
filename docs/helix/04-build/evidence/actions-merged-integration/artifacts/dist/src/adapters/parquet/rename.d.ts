import type { Document, Diagnostic } from '../../model/types';
export interface ParquetRenameResult {
    source: Document;
    status: 'transformed' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    output?: Document;
    rename?: {
        index: number;
        from: string[];
        to: string[];
    };
    unchangedPrefixBytes?: number;
}
/** Rename by stable native schema index, with simultaneous descendant column-path updates. */
export declare function renameParquetField(source: Document, index: number, name: string): ParquetRenameResult;
