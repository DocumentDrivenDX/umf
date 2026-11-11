// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {PostgresqlFieldClassification} from './postgresql-field';
import type schema from '../../spec/core/postgresql-record-classification.schema.json';
export {default as postgresqlRecordClassificationSchema} from '../../spec/core/postgresql-record-classification.schema.json';
export interface PostgresqlRecordRequest {recordModule:string;recordId:string;mode:'strict'|'report';nativeSource:string;relation:{schema:string;name:string};authors?:CoreKindDeclaration[]}
const binding={id:'umf.postgresql.catalog.record',version:'1.0.0',nativeVersion:'17.4',subset:'Captured ordinary/partitioned table member roles; views, composites, raw DDL and execution equivalence excluded'} as const;
type Mapping=Omit<PostgresqlFieldClassification['mapping'],'kind'|'basis'>&{kind:'field'|'record';basis:'checked-catalog-column-membership'|'checked-catalog-table-members'};
export interface PostgresqlRecordClassification {
 operation:'classify-postgresql-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlRecordRequest;binding:typeof binding;mappings:Mapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
