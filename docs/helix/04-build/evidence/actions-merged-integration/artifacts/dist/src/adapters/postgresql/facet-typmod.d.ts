import { type NativeJson } from '../../model/native-json';
export type PostgresqlFacetNativeType = {
    family: 'integer';
    signedBits: 16 | 32 | 64;
} | {
    family: 'decimal';
    precision: number | null;
    scale: number | null;
    specials: 'nan' | 'nan-and-infinities';
    coercesScale: boolean;
} | {
    family: 'string';
    declaredMaxCharacters: number | null;
    padding: 'none' | 'blank-padded' | 'blank-trimmed';
    permitsNul: false;
} | {
    family: 'binary';
    declaredMaxBytes: null;
} | {
    family: 'float';
    bits: 32 | 64;
};
export interface PostgresqlFacetTypeInspection {
    native: NativeJson;
    state: 'observed' | 'unsupported';
    meaning?: PostgresqlFacetNativeType;
    reason?: string;
}
/** Internal native interpretation for PostgreSQL 17.4. Not a core-facet or constraint classification.
 * Numeric layout follows REL_17_4 numeric.c: 4-byte offset, 16-bit precision,
 * signed 11-bit scale. Preserve unknown/reserved layouts rather than masking them.
 */
export declare function inspectPostgresqlFacetType(input: NativeJson): PostgresqlFacetTypeInspection;
