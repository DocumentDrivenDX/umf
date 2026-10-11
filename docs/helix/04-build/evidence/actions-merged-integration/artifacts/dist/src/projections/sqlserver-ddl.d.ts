import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface SqlServerDdlPolicy {
    aliases: 'reject' | 'base-type';
    physicalLayout: 'default-rowstore';
    nativeExpressions: 'verbatim';
    sourceState: 'captured-only' | 'allow-candidate';
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface SqlServerDdlStatement {
    sourcePath: string;
    kind: 'schema' | 'table' | 'key' | 'check' | 'foreign-key' | 'index' | 'disable' | 'description';
    sql: string;
}
export interface SqlServerDdlProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: SqlServerDdlPolicy;
    issues: ProjectionIssue[];
    statements: SqlServerDdlStatement[];
    nativeSource?: string;
}
/** Reviewable lowering to new ordinary tables. Never executes source expressions or generated SQL. */
export declare function projectSqlServerToDdl(input: Document, options: SqlServerDdlPolicy): SqlServerDdlProjection;
