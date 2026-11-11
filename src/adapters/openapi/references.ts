// SPDX-License-Identifier: MIT OR Apache-2.0
import type {NativeJson} from '../../model/native-json';
const kinds=['parameter','header','response','request-body','example','link','security-scheme'] as const;
export type OpenapiReferenceKind=typeof kinds[number];
export interface OpenapiReferenceRequest {pointer:string;kind:OpenapiReferenceKind;resourceUri?:string;}
export interface OpenapiReferenceResolution {
 kind:OpenapiReferenceKind;target:{uri:string;pointer:string;node:NativeJson};
 chain:{uri:string;pointer:string;reference:NativeJson}[];
 effectiveAnnotations:{summary?:string;description?:string};complete:false;limitations:string[];
}
