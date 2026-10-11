import { type ParquetPhysicalValue } from './physical';
import type { Document, Diagnostic } from '../../model/types';
export type ParquetRowValue = null | {
    kind: 'record';
    fields: {
        index: number;
        name: string;
        value: ParquetRowValue;
    }[];
} | {
    kind: 'repeated';
    items: ParquetRowValue[];
} | {
    kind: 'physical';
    value: ParquetPhysicalValue;
};
export interface ParquetRows {
    source: Document;
    status: 'assembled' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    rows?: ParquetRowValue[];
}
export declare const PARQUET_ROW_NODE_LIMIT = 100000;
/** Reconstruct physical records by schema identity; logical LIST/MAP lowering is separate. */
export declare function assembleParquetRows(source: Document): ParquetRows;
