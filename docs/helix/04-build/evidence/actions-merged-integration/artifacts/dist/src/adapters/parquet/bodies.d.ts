import { type ParquetPage } from './pages';
import type { Document, Diagnostic } from '../../model/types';
export interface ParquetDecodedPage extends ParquetPage {
    bodyHex: string;
    checksum: 'verified' | 'absent';
}
export interface ParquetPageBodies {
    source: Document;
    status: 'decoded' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    pages?: ParquetDecodedPage[];
    decodedBytes?: number;
}
/** Bounded physical page-body decoding only; encodings, levels and scalar values are separate. */
export declare function decodeParquetPageBodies(source: Document): ParquetPageBodies;
