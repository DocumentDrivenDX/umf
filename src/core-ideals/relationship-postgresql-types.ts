// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreRelationshipDeclaration} from '../model/relationships';
import type {Diagnostic,Document,Json} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {PostgresqlRelationshipLayoutPolicy,PostgresqlRelationshipLayoutResult} from '../projections/ddd-postgresql/relationship-layout';

interface Residual {source:'logical'|'binding'|'policy'|'native';path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string}
export interface PostgresqlRelationshipObservation {
 nativePath:string;nativeNode:NativeJson;origin:'ddl'|'catalog';name:string|null;sourceTable:string|null;targetTable:string|null;sourceColumns:string[];targetColumns:string[];targetKeyCandidates:string[];
 match:'simple'|'full'|'partial'|'unknown';onUpdate:'no-action'|'restrict'|'cascade'|'set-null'|'set-default'|'unknown';onDelete:PostgresqlRelationshipObservation['onUpdate'];validated:boolean|null;deferrable:boolean;initiallyDeferred:boolean;authorIntent:'unknown';enforcement:'unverified-native-observation';
}
export interface PostgresqlRelationshipRequest {profile:'raw-ddl'|'captured-catalog';mode:'strict'|'report';nativeSource:string}
export interface PostgresqlRelationshipClassification {operation:'classify-postgresql-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlRelationshipRequest;binding:{id:'umf.postgresql.relationships';version:'1.0.0';nativeVersion:'17.4';subset:string};observations:PostgresqlRelationshipObservation[];residuals:Residual[];diagnostics:Diagnostic[]}
export interface RelationshipPostgresqlRequest {id:string;profile:'new-keyed-tables';mode:'strict'|'report';policy:PostgresqlRelationshipLayoutPolicy}
export interface RelationshipPostgresqlProjection {operation:'project-relationships-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;physicalBinding:Document;authors:CoreRelationshipDeclaration[];request:RelationshipPostgresqlRequest;binding:{id:'umf.postgresql.relationships';version:'1.0.0';nativeVersion:'17.4';subset:string};layout:PostgresqlRelationshipLayoutResult;target?:Document;nativeSql?:string;mappings:{relationship:{module:string;id:string};idealPath:string;carrierTable:string;constraints:string[];targetKey:string;outcome:'approximated'}[];residuals:Residual[];diagnostics:Diagnostic[]}
