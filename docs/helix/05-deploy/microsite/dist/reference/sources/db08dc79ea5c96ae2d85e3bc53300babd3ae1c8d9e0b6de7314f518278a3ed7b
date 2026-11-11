// SPDX-License-Identifier: MIT OR Apache-2.0
import type {parquetCarriers} from './parquet-carriers';
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/nullability-parquet-projection.schema.json';
export {default as nullabilityParquetProjectionSchema} from '../../spec/core/nullability-parquet-projection.schema.json';
export interface NullabilityParquetRequest {id:string;recordName:string;fieldName:string;nativeType:keyof typeof parquetCarriers;mode:'strict'|'report';scope:'row-leaf-value'|'repeated-element-value'|'write-input'|'unresolved';carrier:'definition-level'|'unresolved'}
const binding=schema.properties.binding.const;
export interface NullabilityParquetProjection {
 operation:'project-nullability-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreNullabilityDeclaration;request:NullabilityParquetRequest;target?:Document;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';nullability:'required'|'absent-allowed'|'unspecified';encoding:'required'|'optional';basis:'authored-requirement'|'no-authored-requirement'|'unprojected-requirement';scope:NullabilityParquetRequest['scope'];carrier:NullabilityParquetRequest['carrier'];idealPath:string;nativePath:'/schema/1/repetition_type';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
