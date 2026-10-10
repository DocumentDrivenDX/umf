import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
import { type CoreKindDeclaration } from '../model/field-kind';
declare const nativeCarriers: {
    readonly bit: 'boolean';
    readonly tinyint: 'integer';
    readonly smallint: 'integer';
    readonly int: 'integer';
    readonly bigint: 'integer';
    readonly decimal: 'decimal';
    readonly real: 'float';
    readonly 'float(53)': 'float';
    readonly nvarchar: 'string';
    readonly nchar: 'string';
    readonly varchar: 'string';
    readonly char: 'string';
    readonly varbinary: 'binary';
    readonly binary: 'binary';
    readonly date: 'date';
    readonly 'time(7)': 'time';
    readonly 'datetime2(7)': 'timestamp';
    readonly 'datetimeoffset(7)': 'timestamp';
};
export { default as facetsSqlServerProjectionSchema } from '../../spec/core/facets-sqlserver-projection.schema.json';
export interface FacetsSqlServerRequest {
    id: string;
    namespace: string;
    tableName: string;
    columnName: string;
    nativeType: keyof typeof nativeCarriers;
    mode: 'strict' | 'report';
    encoding: 'checked' | 'type-modifier' | 'carrier-only';
    obligation: 'value-domain' | 'exact-input';
}
type Author = CoreFacetDeclaration | CoreKindDeclaration;
type Outcome = 'exact' | 'approximated' | 'unknown' | 'not-expressible';
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
export interface FacetsSqlServerProjection {
    operation: 'project-facets-sqlserver';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: Author;
    request: FacetsSqlServerRequest;
    target?: {
        format: 'sqlserver-ddl';
        sql: string;
    };
    nativeSql?: string;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: '/sql';
        facets: CoreFacetPatch;
        encoding: FacetsSqlServerRequest['encoding'];
        outcome: Outcome;
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: Exclude<Outcome, 'exact'>;
        recovery: typeof recovery;
    }[];
}
/** Project verified author intent. Native carrier defaults never become author assertions. */
export declare function projectFacetsToSqlServer(input: Author, options: FacetsSqlServerRequest): FacetsSqlServerProjection;
/** Verify the entire operation and exact native text before recovering retained ideal meaning. */
export declare function recoverFacetsFromSqlServer(input: FacetsSqlServerProjection, nativeText: string): Document;
