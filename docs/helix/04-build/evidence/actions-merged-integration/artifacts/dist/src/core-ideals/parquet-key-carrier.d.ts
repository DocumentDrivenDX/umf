import { type ParquetFacetCarrier } from './parquet-facet-carrier';
/** Compose validated scalar declarations into one empty native record file. No row writer. */
export declare function parquetKeyFile(recordName: string, input: {
    name: string;
    carrier: ParquetFacetCarrier;
    fieldId?: number;
}[]): Uint8Array;
