import type { NativeJson } from '../../model/native-json';
export type AvroFacetDeclaredType = {
    family: 'integer';
    bits: 32 | 64;
    signed: true;
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
    carrier: 'bytes' | 'fixed';
    exactBytes: number | null;
};
export interface AvroFacetTypeInspection {
    native: NativeJson;
    state: 'declared' | 'unsupported';
    meaning?: AvroFacetDeclaredType;
    reason?: string;
    unclaimedPaths: string[];
    /** Never a codec, input-conversion, schema-validity or core-equivalence guarantee. */
    basis: 'isolated-native-declaration';
    enforcement: 'unverified';
}
/** Decode a selected native type fragment after name/union selection. Whole-schema
 * validation and selection are separate. Unknown content is copied, never erased.
 * This internal helper does not assign core facets or certify native enforcement.
 */
export declare function inspectAvroFacetType(input: NativeJson): AvroFacetTypeInspection;
