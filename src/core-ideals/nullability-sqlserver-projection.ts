// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/nullability-sqlserver-projection.schema.json';
export {default as nullabilitySqlServerProjectionSchema} from '../../spec/core/nullability-sqlserver-projection.schema.json';
import type {sqlServerCarriers as carriers} from './sqlserver-syntax';
export interface NullabilitySqlServerRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report';scope:'stored-relation'|'query-result'|'write-input'|'unresolved';carrier:'sql-null'|'unresolved'}
const binding=schema.properties.binding.const;
export interface NullabilitySqlServerProjection {
 operation:'project-nullability-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreNullabilityDeclaration;request:NullabilitySqlServerRequest;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';nullability:'required'|'absent-allowed'|'unspecified';encoding:'not-null'|'null';basis:'authored-requirement'|'no-authored-requirement'|'unprojected-requirement';scope:NullabilitySqlServerRequest['scope'];carrier:NullabilitySqlServerRequest['carrier'];idealPath:string;nativePath:'/sql';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
