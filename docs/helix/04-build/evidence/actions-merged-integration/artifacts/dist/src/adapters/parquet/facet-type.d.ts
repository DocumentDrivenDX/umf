import { type Json } from '../../model/types';
export type ParquetFacetDeclaredType = {
    family: 'integer';
    bits: 8 | 16 | 32 | 64;
    signed: boolean;
} | {
    family: 'float';
    bits: 32 | 64;
} | {
    family: 'string';
} | {
    family: 'binary';
    exactBytes: number | null;
} | {
    family: 'decimal';
    precision: number;
    scale: number;
    carrier: 'int32' | 'int64' | 'bytes' | 'fixed';
    exactBytes: number | null;
};
export interface ParquetFacetTypeInspection {
    native: Json;
    state: 'declared' | 'unsupported';
    meaning?: ParquetFacetDeclaredType;
    reason?: string;
    unclaimedPaths: string[];
    basis: 'isolated-native-declaration';
    enforcement: 'unverified';
}
/** Internal interpretation of one decoded Thrift SchemaElement. Does not select
 * a container item, validate a file, assign core facets or promise enforcement.
 * All original metadata is retained; unknown semantic annotations refuse.
 */
export declare function inspectParquetFacetType(input: Json): ParquetFacetTypeInspection;
