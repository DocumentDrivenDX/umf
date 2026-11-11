// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
export {default as postgresqlDdlKindsSchema} from '../../spec/core/postgresql-ddl-kinds.schema.json';
export interface PostgresqlDdlKindRequest {module:string;recordId:string;declaration:string;mode:'strict'|'report'}
const binding={id:'umf.postgresql.ddl.record',version:'1.0.0',nativeVersion:'17.4',subset:'Explicit CREATE TABLE declaration only; no catalog expansion or statement replay'} as const;
const compositeBinding={id:'umf.postgresql.ddl.composite',version:'1.0.0',nativeVersion:'17.4',subset:'Explicit CREATE TYPE AS composite attributes only; no type resolution or statement replay'} as const;
export interface PostgresqlDdlKinds {
 operation:'classify-postgresql-ddl-record';version:'1.0.0';scope:'declared-only';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlDdlKindRequest;binding:typeof binding|typeof compositeBinding;namespaceResolution:'explicit'|'create-schema-context'|'unresolved';
 mappings:{origin:'classified';kind:'field'|'record';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-raw-column-declaration'|'checked-raw-table-declaration'|'checked-raw-composite-declaration';outcome:'exact'|'unknown'}[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
