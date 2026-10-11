import { type ParquetTypedValue } from '../parquet/values';
import { type NativeJson } from '../../model/native-json';
import type { Document, Diagnostic } from '../../model/types';
export interface DeltaScalarConversion {
    row: number;
    path: string;
    input: ParquetTypedValue;
    output: NativeJson;
}
export interface DeltaParquetActions {
    source: Document;
    status: 'projected' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    log?: Document;
    actions?: {
        row: number;
        action: string;
        value: NativeJson;
    }[];
    omittedNullFields?: {
        row: number;
        path: string;
    }[];
    scalarConversions?: DeltaScalarConversion[];
}
/** Project representable checkpoint rows into Delta actions, retaining authoritative Parquet source. */
export declare function projectDeltaParquetActions(source: Document): DeltaParquetActions;
