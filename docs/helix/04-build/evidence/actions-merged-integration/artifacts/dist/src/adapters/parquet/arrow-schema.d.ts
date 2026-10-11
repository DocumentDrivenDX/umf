import type { Document, Diagnostic } from '../../model/types';
export interface ParquetArrowSchema {
    source: Document;
    status: 'absent' | 'decoded' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    metadataIndex?: number;
    ipcHex?: string;
    message?: Document;
    schema?: Document;
}
/** Decode the optional ARROW:schema declaration; never infer correspondence to physical data. */
export declare function getParquetArrowSchema(source: Document): ParquetArrowSchema;
