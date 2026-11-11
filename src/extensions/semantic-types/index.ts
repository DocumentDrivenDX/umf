// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreSemanticTypeReference,Json,JsonObject} from '../../model/types';
export {SEMANTIC_TYPES_EXTENSION,semanticTypesPackage} from './package';
export {SemanticTypeRegistry,validateSemanticTypeValue,semanticTypesRegistry,getSemanticTypes,setSemanticTypes} from '#umf-source';
export interface SemanticTypeReference extends CoreSemanticTypeReference {}
export interface SemanticTypeAnnotation {types:SemanticTypeReference[];[key:string]:unknown}
export interface SemanticTypeCheck {status:'valid'|'invalid'|'unknown';complete:boolean;issues:string[]}
export interface SemanticTypeValueResult extends SemanticTypeCheck {reference:SemanticTypeReference}
export type SemanticTypeValidator=(value:Json,definition:JsonObject)=>SemanticTypeCheck;
