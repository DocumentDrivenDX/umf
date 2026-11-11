// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {default as sqlserverFieldClassificationSchema} from '../../spec/core/sqlserver-field-classification.schema.json';
export interface SqlServerFieldRequest {column:string;nativeSource:string;mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.sqlserver.catalog.field',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Captured catalog column membership; excludes raw DDL and native constraint/value equivalence'} as const;
export interface SqlServerFieldClassification {
 operation:'classify-sqlserver-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerFieldRequest;binding:typeof binding;
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-catalog-column-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];diagnostics:Diagnostic[];
}
