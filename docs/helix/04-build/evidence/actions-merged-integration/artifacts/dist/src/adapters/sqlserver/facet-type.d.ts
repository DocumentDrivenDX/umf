import type { NativeJson } from '../../model/native-json';
export type SqlServerFacetNativeType = {
    family: 'integer';
    bits: 8 | 16 | 32 | 64;
    signed: boolean;
} | {
    family: 'decimal';
    precision: number;
    scale: number;
    inputRounding: 'session-dependent';
} | {
    family: 'float';
    bits: 32 | 64;
    mantissaBits: 24 | 53;
} | {
    family: 'string';
    size: 'bounded' | 'max';
    maxBytes: number | null;
    maxUtf16Units: number | null;
    representation: 'utf16-code-units' | 'collation-dependent';
    padding: 'fixed' | 'variable';
    collation: string;
} | {
    family: 'binary';
    size: 'bounded' | 'max';
    maxBytes: number | null;
    padding: 'fixed' | 'variable';
};
export interface SqlServerFacetTypeInspection {
    native: NativeJson;
    state: 'observed' | 'unsupported';
    meaning?: SqlServerFacetNativeType;
    reason?: string;
}
/** Internal native type facts for SQL Server 16.0.4295.3. Neither core facets nor
 * CHECK enforcement, Unicode validity, input exactness or source authenticity. */
export declare function inspectSqlServerFacetType(input: NativeJson): SqlServerFacetTypeInspection;
