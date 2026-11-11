// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Nullability} from '../model/types';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/parquet-nullability-classification.schema.json';
import type {PARQUET_NULLABILITY_EXTENSION} from './parquet-nullability-package';
export {PARQUET_NULLABILITY_EXTENSION,parquetNullabilityPackage,parquetNullabilityClassificationSchema} from './parquet-nullability-package';
export interface ParquetNullabilityRequest {
 index:number;mode:'strict'|'report';scope:'row-leaf-value'|'repeated-element-value'|'write-input'|'unresolved';carrier:'definition-level'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface ParquetNullabilityClassification {
 operation:'classify-parquet-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:Json;ancestry:{index:number;repetition:'required'|'optional'|'repeated';definitionLevel:number;repetitionLevel:number}[];contextIndex:number|null;absencePaths:string[];nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:ParquetNullabilityRequest['scope'];carrier:ParquetNullabilityRequest['carrier'];basis:'Physical definition-level availability in the selected context; repeated cardinality, writer inputs, Arrow metadata and logical refinements remain separate'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
