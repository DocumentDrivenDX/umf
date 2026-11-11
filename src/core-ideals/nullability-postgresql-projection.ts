// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/nullability-postgresql-projection.schema.json';
export {default as nullabilityPostgresqlProjectionSchema} from '../../spec/core/nullability-postgresql-projection.schema.json';
import type {carriers} from './postgresql-syntax';
export interface NullabilityPostgresqlRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report';scope:'stored-relation'|'query-result'|'write-input'|'unresolved';carrier:'sql-null'|'unresolved'}
const binding=schema.properties.binding.const;
export interface NullabilityPostgresqlProjection {
 operation:'project-nullability-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreNullabilityDeclaration;request:NullabilityPostgresqlRequest;target?:Document;nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';nullability:'required'|'absent-allowed'|'unspecified';encoding:'not-null'|'null'|'omitted';scope:NullabilityPostgresqlRequest['scope'];carrier:NullabilityPostgresqlRequest['carrier'];idealPath:string;nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
