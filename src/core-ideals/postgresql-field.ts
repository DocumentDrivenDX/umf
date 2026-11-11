// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {default as postgresqlFieldClassificationSchema} from '../../spec/core/postgresql-field-classification.schema.json';
export interface PostgresqlFieldRequest {column:string;nativeSource:string;mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.postgresql.catalog.field',version:'1.0.0',nativeVersion:'17.4',subset:'Captured catalog column membership; excludes raw DDL and native constraint/value equivalence'} as const;
export interface PostgresqlFieldClassification {
 operation:'classify-postgresql-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlFieldRequest;binding:typeof binding;
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-catalog-column-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];diagnostics:Diagnostic[];
}
