export type ParquetPhysicalValue = {
    type: 'BOOLEAN';
    value: boolean;
} | {
    type: 'INT32' | 'INT64';
    value: string;
} | {
    type: 'FLOAT' | 'DOUBLE' | 'INT96' | 'BYTE_ARRAY' | 'FIXED_LEN_BYTE_ARRAY';
    hex: string;
};
export declare function physicalValueBytes(v: ParquetPhysicalValue): number;
/** Exact physical carriers only; caller owns logical interpretation. */
export declare function decodeParquetPlain(input: Uint8Array, type: string, count: number, fixedLength?: number): ParquetPhysicalValue[];
