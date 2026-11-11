// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {fieldPostgresqlProjectionSchema} from './field-postgresql-package';
import type {carriers} from './postgresql-syntax';
export interface FieldPostgresqlRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report'}
const binding={id:'umf.core.field.postgresql',version:'1.0.0',nativeVersion:'17.4',subset:'Single authored Field with explicit pg_catalog carrier; no value-domain or execution equivalence'} as const;
export interface FieldPostgresqlProjection {
 operation:'project-field-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:FieldPostgresqlRequest;target?:Document;nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';idealPath:string;nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
