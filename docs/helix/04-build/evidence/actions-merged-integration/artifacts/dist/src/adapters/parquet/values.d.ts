import { type ParquetRowValue } from './rows';
import type { ParquetPhysicalValue } from './physical';
import type { Document, Diagnostic, Json } from '../../model/types';
export type ParquetTypedValue = null | {
    kind: 'struct';
    fields: {
        index: number;
        name: string;
        value: ParquetTypedValue;
    }[];
} | {
    kind: 'list';
    items: ParquetTypedValue[];
} | {
    kind: 'map';
    entries: {
        key: ParquetTypedValue;
        value: ParquetTypedValue;
    }[];
    duplicateKeys: 'last-value';
} | {
    kind: 'opaque';
    annotation: string;
    parameters: Json;
    physical: ParquetRowValue;
} | {
    kind: 'bool';
    value: boolean;
    physical: ParquetPhysicalValue;
} | {
    kind: 'int' | 'uint' | 'float';
    bits: number;
    value: string;
    physical: ParquetPhysicalValue;
} | {
    kind: 'decimal' | 'string' | 'enum' | 'json' | 'bytes' | 'uuid' | 'int96' | 'date';
    value: string;
    physical: ParquetPhysicalValue;
} | {
    kind: 'time' | 'timestamp';
    unit: 'MILLIS' | 'MICROS' | 'NANOS';
    isAdjustedToUTC: boolean;
    value: string;
    physical: ParquetPhysicalValue;
};
export interface ParquetValues {
    source: Document;
    status: 'projected' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    rows?: ParquetTypedValue[];
}
/** Logical views retain physical scalars and authoritative source; unsupported meanings stay opaque. */
export declare function decodeParquetValues(source: Document): ParquetValues;
