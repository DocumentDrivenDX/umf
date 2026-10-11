import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
import { type NativeJson } from '../model/native-json';
import { type PostgresqlBackend } from '../adapters/postgresql';
import { type CoreRelationshipDeclaration } from '../model/relationships';
import { type PostgresqlRelationshipLayoutPolicy, type PostgresqlRelationshipLayoutResult } from '../projections/ddd-postgresql/relationship-layout';
export declare const POSTGRESQL_RELATIONSHIPS_EXTENSION = "umf.postgresql.relationships";
export declare const postgresqlRelationshipsPackage: ExtensionPackage;
export { default as postgresqlRelationshipClassificationSchema } from '../../spec/core/postgresql-relationship-classification.schema.json';
export { default as relationshipPostgresqlProjectionSchema } from '../../spec/core/relationship-postgresql-projection.schema.json';
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
interface Residual {
    source: 'logical' | 'binding' | 'policy' | 'native';
    path: string;
    value: Json;
    outcome: 'unknown' | 'not-expressible' | 'approximated';
    reason: string;
}
export interface PostgresqlRelationshipObservation {
    nativePath: string;
    nativeNode: NativeJson;
    origin: 'ddl' | 'catalog';
    name: string | null;
    sourceTable: string | null;
    targetTable: string | null;
    sourceColumns: string[];
    targetColumns: string[];
    targetKeyCandidates: string[];
    match: 'simple' | 'full' | 'partial' | 'unknown';
    onUpdate: 'no-action' | 'restrict' | 'cascade' | 'set-null' | 'set-default' | 'unknown';
    onDelete: PostgresqlRelationshipObservation['onUpdate'];
    validated: boolean | null;
    deferrable: boolean;
    initiallyDeferred: boolean;
    authorIntent: 'unknown';
    enforcement: 'unverified-native-observation';
}
export interface PostgresqlRelationshipRequest {
    profile: 'raw-ddl' | 'captured-catalog';
    mode: 'strict' | 'report';
    nativeSource: string;
}
export interface PostgresqlRelationshipClassification {
    operation: 'classify-postgresql-relationships';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: PostgresqlRelationshipRequest;
    binding: typeof binding;
    observations: PostgresqlRelationshipObservation[];
    residuals: Residual[];
    diagnostics: Diagnostic[];
}
/** Native declarations/observations remain distinct from authored association intent. */
export declare function classifyPostgresqlRelationships(input: Document, options: PostgresqlRelationshipRequest, backend: PostgresqlBackend): Promise<PostgresqlRelationshipClassification>;
export declare function verifyPostgresqlRelationshipClassification(input: PostgresqlRelationshipClassification, current: Document, backend: PostgresqlBackend): Promise<PostgresqlRelationshipClassification & {
    [x: string]: {};
}>;
export declare function recoverPostgresqlRelationshipSource(input: PostgresqlRelationshipClassification, current: Document, backend: PostgresqlBackend): Promise<string>;
export interface RelationshipPostgresqlRequest {
    id: string;
    profile: 'new-keyed-tables';
    mode: 'strict' | 'report';
    policy: PostgresqlRelationshipLayoutPolicy;
}
export interface RelationshipPostgresqlProjection {
    operation: 'project-relationships-postgresql';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    physicalBinding: Document;
    authors: CoreRelationshipDeclaration[];
    request: RelationshipPostgresqlRequest;
    binding: typeof binding;
    layout: PostgresqlRelationshipLayoutResult;
    target?: Document;
    nativeSql?: string;
    mappings: {
        relationship: {
            module: string;
            id: string;
        };
        idealPath: string;
        carrierTable: string;
        constraints: string[];
        targetKey: string;
        outcome: 'approximated';
    }[];
    residuals: Residual[];
    diagnostics: Diagnostic[];
}
/** New ordinary keyed tables, followed by ALTER TABLE FKs. This is not the full DDD generator. */
export declare function projectRelationshipsToPostgresql(input: Document, physicalInput: Document, authorInput: CoreRelationshipDeclaration[], options: RelationshipPostgresqlRequest, backend: PostgresqlBackend): Promise<RelationshipPostgresqlProjection>;
export declare function verifyRelationshipPostgresqlProjection(input: RelationshipPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<RelationshipPostgresqlProjection>;
export declare function recoverRelationshipPostgresqlIdeal(input: RelationshipPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<Document>;
export declare function recoverRelationshipPostgresqlNative(input: RelationshipPostgresqlProjection, current: Document, backend: PostgresqlBackend): Promise<string>;
