import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreCardinalityDeclaration } from '../model/cardinality';
import { type PostgresqlBackend } from '../adapters/postgresql';
export { default as cardinalityPostgresqlProjectionSchema } from '../../spec/core/cardinality-postgresql-projection.schema.json';
import { carriers } from './postgresql-syntax';
export interface CardinalityPostgresqlRequest {
    id: string;
    namespace: string;
    tableName: string;
    columnName: string;
    nativeType: keyof typeof carriers | 'jsonb';
    mode: 'strict' | 'report';
    storage: 'scalar' | 'array' | 'jsonb-object';
    requireExactValues: boolean;
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface CardinalityPostgresqlProjection {
    operation: 'project-cardinality-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreCardinalityDeclaration;
    request: CardinalityPostgresqlRequest;
    target?: Document;
    nativeSql?: string;
    diagnostics: Diagnostic[];
    binding: typeof binding;
    mapping: {
        basis: 'Explicit author declaration and requested native carrier; retained residuals qualify unrepresented obligations';
        origin: 'authored';
        cardinality: 'one' | 'array' | 'map' | 'unspecified';
        encoding: 'scalar' | 'sequence-check' | 'object-check' | 'carrier-only';
        idealPath: string;
        nativePath: '/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';
        outcome: 'exact' | 'approximated' | 'unknown' | 'not-expressible';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'approximated' | 'unknown' | 'not-expressible';
        recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
    }[];
}
export declare function projectCardinalityToPostgresql(input: CoreCardinalityDeclaration, options: CardinalityPostgresqlRequest, backend: PostgresqlBackend): Promise<CardinalityPostgresqlProjection>;
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverCardinalityFromPostgresql(input: CardinalityPostgresqlProjection, nativeText: string, backend: PostgresqlBackend): Promise<Document>;
