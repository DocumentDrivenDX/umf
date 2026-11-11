// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/nullability-tablespec-projection.schema.json';
export {default as nullabilityTableSpecProjectionSchema} from '../../spec/core/nullability-tablespec-projection.schema.json';
export interface NullabilityTableSpecRequest {id:string;tableName:string;columnName:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'FLOAT'|'TEXT'|'VARCHAR'|'CHAR'|'DATE'|'DATETIME'|'TIMESTAMP';mode:'strict'|'report';profile:'runtime-model'|'checked-schema'|'unresolved';context:string|null;carrier:'null-value'|'unresolved'}
const binding=schema.properties.binding.const;
export interface NullabilityTableSpecProjection {
 operation:'project-nullability-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreNullabilityDeclaration;request:NullabilityTableSpecRequest;target?:Document;binding:typeof binding;diagnostics?:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:string|null;nullability:'required'|'absent-allowed'|'unspecified';encoding:'boolean'|'context-map'|'omitted';context:string|null;carrier:NullabilityTableSpecRequest['carrier'];profile:NullabilityTableSpecRequest['profile'];outcome:'exact'|'unknown'|'not-expressible'};
 profileNotes:{profile:'checked-schema';code:'SCALAR_BOOLEAN_REJECTED';message:string}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
