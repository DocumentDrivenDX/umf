// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Cardinality} from '../model/types';
import type {NativeJson} from '../model/native-json';
import type {CoreCardinalityDeclaration} from '../model/cardinality';
import schema from '../../spec/core/tablespec-cardinality-classification.schema.json';
import type {TABLESPEC_CARDINALITY_EXTENSION} from './cardinality-tablespec-package';
export {TABLESPEC_CARDINALITY_EXTENSION,tableSpecCardinalityPackage} from './cardinality-tablespec-package';
export {default as tableSpecCardinalityClassificationSchema} from '../../spec/core/tablespec-cardinality-classification.schema.json';
export interface TableSpecCardinalityRequest {
 column:number;mode:'strict'|'report';profile:'runtime-model'|'checked-schema'|'unresolved';author?:CoreCardinalityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
export interface TableSpecCardinalityClassification {
 operation:'classify-tablespec-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';basis:'Explicit native data_type and uncoerced dimension under selected metadata profile; item and execution semantics remain native'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
