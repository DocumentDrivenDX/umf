import { parquetCarriers } from './parquet-carriers';
type Availability = {
    nullable: boolean;
    fieldId?: number;
};
export type ParquetCardinalityCarrier = Availability & ({
    kind: 'scalar';
    nativeType: keyof typeof parquetCarriers;
} | {
    kind: 'array';
    item: ParquetCardinalityCarrier;
} | {
    kind: 'map';
    keyType: keyof typeof parquetCarriers;
    value: ParquetCardinalityCarrier;
} | {
    kind: 'record';
    fields: {
        name: string;
        type: ParquetCardinalityCarrier;
    }[];
});
/** Empty native schema file. Explicit carrier choice, never an implicit ideal or row conversion. */
export declare function parquetCardinalityFile(recordName: string, fieldName: string, input: ParquetCardinalityCarrier): Uint8Array;
export {};
