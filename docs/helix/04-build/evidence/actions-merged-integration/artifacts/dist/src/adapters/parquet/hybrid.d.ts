export interface ParquetHybridValues {
    values: number[];
    consumedBytes: number;
    padding: number[];
}
/** Raw hybrid run stream; caller strips any length/bit-width prefixes first. */
export declare function decodeParquetHybrid(input: Uint8Array, width: number, count: number, maxValue?: number): ParquetHybridValues;
