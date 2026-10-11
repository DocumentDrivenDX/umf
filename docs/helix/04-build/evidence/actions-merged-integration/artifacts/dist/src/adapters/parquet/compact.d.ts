import type { ParquetWireValue } from './footer';
/** Reads one bounded Compact struct prefix; caller controls its byte region. */
export declare function decodeCompactStruct(bytes: Uint8Array): {
    value: ParquetWireValue;
    consumedBytes: number;
};
