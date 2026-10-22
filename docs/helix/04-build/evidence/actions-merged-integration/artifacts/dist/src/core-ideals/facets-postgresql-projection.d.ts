import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type PostgresqlBackend } from '../adapters/postgresql';
declare const nativeCarriers: {
    readonly boolean: readonly ['bool', 'boolean'];
    readonly smallint: readonly ['int2', 'integer'];
    readonly integer: readonly ['int4', 'integer'];
    readonly bigint: readonly ['int8', 'integer'];
    readonly numeric: readonly ['numeric', 'decimal'];
    readonly real: readonly ['float4', 'float'];
    readonly 'double precision': readonly ['float8', 'float'];
    readonly text: readonly ['text', 'string'];
    readonly bytea: readonly ['bytea', 'binary'];
    readonly date: readonly ['date', 'date'];
    readonly time: readonly ['time', 'time'];
    readonly 'time with time zone': readonly ['timetz', 'time'];
    readonly timestamp: readonly ['timestamp', 'timestamp'];
    readonly 'timestamp with time zone': readonly ['timestamptz', 'timestamp'];
    readonly varchar: readonly ['varchar', 'string'];
    readonly char: readonly ['bpchar', 'string'];
};
export { default as facetsPostgresqlProjectionSchema } from '../../spec/core/facets-postgresql-projection.schema.json';
export interface FacetsPostgresqlRequest {
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
export interface FacetsPostgresqlProjection {
    operation: 'project-facets-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: Author;
    request: FacetsPostgresqlRequest;
    target?: Document;
    nativeSql?: string;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: '/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';
        facets: CoreFacetPatch;
        encoding: FacetsPostgresqlRequest['encoding'];
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
export declare function projectFacetsToPostgresql(input: Author, options: FacetsPostgresqlRequest, backend: PostgresqlBackend): Promise<FacetsPostgresqlProjection>;
/** Verify the entire operation and exact native text before recovering retained ideal meaning. */
export declare function recoverFacetsFromPostgresql(input: FacetsPostgresqlProjection, nativeText: string, backend: PostgresqlBackend): Promise<Document>;
