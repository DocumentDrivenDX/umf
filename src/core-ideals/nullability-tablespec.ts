// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Nullability} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import schema from '../../spec/core/tablespec-nullability-classification.schema.json';
import type {TABLESPEC_NULLABILITY_EXTENSION} from './nullability-tablespec-package';
export {TABLESPEC_NULLABILITY_EXTENSION,tableSpecNullabilityPackage} from './nullability-tablespec-package';
export {default as tableSpecNullabilityClassificationSchema} from '../../spec/core/tablespec-nullability-classification.schema.json';
export interface TableSpecNullabilityRequest {
 column:number;mode:'strict'|'report';profile:'runtime-model'|'checked-schema'|'unresolved';context:string|null;carrier:'null-value'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface TableSpecNullabilityClassification {
 operation:'classify-tablespec-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';context:string|null;carrier:TableSpecNullabilityRequest['carrier'];basis:'Native declaration under selected profile and context; not runtime coercion or row validation'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
