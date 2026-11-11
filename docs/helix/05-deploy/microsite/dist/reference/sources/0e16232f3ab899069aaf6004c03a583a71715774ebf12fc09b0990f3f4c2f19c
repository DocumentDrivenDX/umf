// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type schema from '../../spec/core/postgresql-composite-classification.schema.json';
export {default as postgresqlCompositeClassificationSchema} from '../../spec/core/postgresql-composite-classification.schema.json';
export interface PostgresqlCompositeRequest {recordModule:string;recordId:string;mode:'strict'|'report';nativeSource:string;relation:{schema:string;name:string}}
const binding={id:'umf.postgresql.catalog.composite',version:'1.0.0',nativeVersion:'17.4',subset:'Captured standalone composite member roles only; formatted attribute type names do not resolve scalar families or nested identities'} as const;
export interface PostgresqlCompositeClassification {
 operation:'classify-postgresql-composite';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlCompositeRequest;binding:typeof binding;
 mappings:{origin:'classified';kind:'field'|'record';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-catalog-composite'|'checked-catalog-composite-attribute';outcome:'exact'|'unknown'}[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
