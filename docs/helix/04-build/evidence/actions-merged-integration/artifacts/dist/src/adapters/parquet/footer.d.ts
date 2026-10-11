import type { Document, Diagnostic } from '../../model/types';
export type ParquetWireKind = 'bool' | 'i8' | 'i16' | 'i32' | 'i64' | 'double' | 'binary' | 'list' | 'set' | 'map' | 'struct' | 'uuid';
export type ParquetWireValue = {
    kind: 'bool';
    value: boolean;
} | {
    kind: 'i8' | 'i16' | 'i32' | 'i64';
    value: string;
} | {
    kind: 'double';
    bits: string;
} | {
    kind: 'binary' | 'uuid';
    hex: string;
} | {
    kind: 'list' | 'set';
    elementType: ParquetWireKind;
    items: ParquetWireValue[];
} | {
    kind: 'map';
    keyType?: ParquetWireKind;
    valueType?: ParquetWireKind;
    entries: {
        key: ParquetWireValue;
        value: ParquetWireValue;
    }[];
} | {
    kind: 'struct';
    fields: {
        id: number;
        value: ParquetWireValue;
    }[];
};
export interface ParquetFooterDecode {
    source: Document;
    status: 'decoded' | 'blocked';
    complete: false;
    diagnostics: Diagnostic[];
    value?: ParquetWireValue;
    consumedBytes?: number;
    trailingBytes?: number;
}
/** Bounded Compact Protocol tree. Field semantics and native Parquet validity remain unverified. */
export declare function decodeParquetFooter(document: Document): ParquetFooterDecode;
