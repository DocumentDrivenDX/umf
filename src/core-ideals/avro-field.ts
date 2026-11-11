// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type schema from '../../spec/core/avro-field-classification.schema.json';
export {default as avroFieldClassificationSchema} from '../../spec/core/avro-field-classification.schema.json';
export interface AvroFieldRequest {column:string;nativeSource:string;dependencies?:{id:string;schema:string}[];mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.avro.field',version:'1.0.0',nativeVersion:'1.12.0',subset:'Declared record/error field membership with named dependencies; logical refinements, presence and value-domain equivalence excluded'} as const;
export interface AvroFieldClassification {
 operation:'classify-avro-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroFieldRequest;binding:typeof binding;
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;dependencyId?:string;nativeFragment:Json;basis:'checked-record-field-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];diagnostics:Diagnostic[];
}
