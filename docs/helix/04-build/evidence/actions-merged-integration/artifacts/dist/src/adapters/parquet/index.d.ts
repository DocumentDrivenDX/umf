import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage, type Diagnostic } from '../../model/types';
export declare const PARQUET_EXTENSION = "umf.parquet";
export declare const PARQUET_MAX_BYTES = 1000000;
export declare const parquetPackage: ExtensionPackage;
export declare function parquetRegistry(): Registry;
/** Captures even malformed source, without interpreting or normalizing any bytes. */
export declare function captureParquet(bytes: Uint8Array, options: {
    id: string;
}): Document;
export declare function exportParquetCapture(doc: Document): Uint8Array;
export interface ParquetFraming {
    source: Document;
    status: 'located' | 'invalid';
    complete: false;
    byteLength: number;
    footerRegion?: {
        offset: number;
        length: number;
        mode: 'plaintext-or-signed' | 'encrypted';
    };
    diagnostics: Diagnostic[];
}
/** Only locates the footer region. PAR1 can contain encrypted columns or a signed footer. */
export declare function inspectParquetFraming(doc: Document): ParquetFraming;
