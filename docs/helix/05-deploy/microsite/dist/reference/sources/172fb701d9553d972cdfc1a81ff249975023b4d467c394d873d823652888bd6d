// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {default as tableSpecFieldClassificationSchema} from '../../spec/core/tablespec-field-classification.schema.json';
export interface TableSpecFieldRequest {column:number;mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.tablespec.field',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Table version 1.0 captured column member role; no scalar/container/native validation claim'} as const;
export interface TableSpecFieldClassification {
 operation:'classify-tablespec-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecFieldRequest;binding:typeof binding;diagnostics?:Diagnostic[];
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-native-column-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];
}
