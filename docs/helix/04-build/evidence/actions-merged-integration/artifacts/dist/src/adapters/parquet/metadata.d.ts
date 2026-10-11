import { type ParquetWireValue } from './footer';
import type { Document, Diagnostic, Json } from '../../model/types';
export interface ParquetMetadataInspection {
    source: Document;
    status: 'mapped' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    wire?: ParquetWireValue;
    metadata?: Json;
}
/** Maps known IDL fields; opaque fields and authoritative bytes remain available. */
export declare function inspectParquetMetadata(source: Document): ParquetMetadataInspection;
