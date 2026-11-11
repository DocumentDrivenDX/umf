// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {default as fieldSqlServerProjectionSchema} from '../../spec/core/field-sqlserver-projection.schema.json';
import type {sqlServerCarriers as carriers} from './sqlserver-syntax';
export interface FieldSqlServerRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report'}
const binding={id:'umf.core.field.sqlserver',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Single authored Field to permanent table DDL with explicit builtin carrier and nullable column; no value-domain or constraint equivalence'} as const;
export interface FieldSqlServerProjection {
 operation:'project-field-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:FieldSqlServerRequest;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';idealPath:string;nativePath:'/sql';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
