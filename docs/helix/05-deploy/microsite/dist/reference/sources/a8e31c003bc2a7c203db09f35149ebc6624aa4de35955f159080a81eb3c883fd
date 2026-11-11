// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {FieldPostgresqlRequest,FieldPostgresqlProjection} from './field-postgresql-projection';
export {recordPostgresqlProjectionSchema} from './record-postgresql-package';
export interface RecordPostgresqlRequest {id:string;namespace:string;tableName:string;mode:'strict'|'report';fields:{author:CoreKindDeclaration;columnName:string;nativeType:FieldPostgresqlRequest['nativeType']}[]}
const binding={id:'umf.core.record.postgresql',version:'1.0.0',nativeVersion:'17.4',subset:'Authored record with explicit pg_catalog field carriers; no value-domain or execution equivalence'} as const;
export interface RecordPostgresqlProjection {operation:'project-record-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:RecordPostgresqlRequest;binding:typeof binding;target?:Document;nativeSql?:string;mappings:{origin:'authored';kind:'record'|'field';idealPath:string;nativePath:string;outcome:'exact'|'unknown'|'not-expressible'}[];residuals:FieldPostgresqlProjection['residuals'];diagnostics:Diagnostic[]}
