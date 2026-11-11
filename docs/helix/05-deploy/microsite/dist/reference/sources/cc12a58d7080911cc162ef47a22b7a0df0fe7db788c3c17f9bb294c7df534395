// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {FieldSqlServerRequest,FieldSqlServerProjection} from './field-sqlserver-projection';
export {default as recordSqlServerProjectionSchema} from '../../spec/core/record-sqlserver-projection.schema.json';
export interface RecordSqlServerRequest {id:string;namespace:string;tableName:string;identifierCollation:'Latin1_General_100_BIN2';mode:'strict'|'report';fields:{author:CoreKindDeclaration;columnName:string;nativeType:FieldSqlServerRequest['nativeType']}[]}
const binding={id:'umf.core.record.sqlserver',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Authored flat record with explicit builtin nullable carriers; requires database identifier collation Latin1_General_100_BIN2; no value-domain equivalence'} as const;
export interface RecordSqlServerProjection {operation:'project-record-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:RecordSqlServerRequest;binding:typeof binding;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;mappings:{origin:'authored';kind:'record'|'field';idealPath:string;nativePath:string;outcome:'exact'|'unknown'|'not-expressible'}[];residuals:FieldSqlServerProjection['residuals'];diagnostics:Diagnostic[]}
