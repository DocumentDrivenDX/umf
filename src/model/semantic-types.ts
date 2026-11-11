// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,CoreSemanticTypeReference,Diagnostic} from './types';
import type {SemanticTypeValueResult} from '../extensions/semantic-types';
export interface CoreSemanticTypeIdentity {module:string;element:string}
export type CoreSemanticTypeMeaning={state:'missing'}|{state:'declared';types:CoreSemanticTypeReference[]};
export interface CoreSemanticTypeInspection {operation:'inspect-core-semantic-types';version:'2.0.0';source:Document;identity:CoreSemanticTypeIdentity;path:string;meaning:CoreSemanticTypeMeaning;diagnostics:Diagnostic[]}
export interface CoreSemanticTypeDeclaration {operation:'declare-core-semantic-types';version:'2.0.0';source:Document;target:Document;identity:CoreSemanticTypeIdentity;request:{types:CoreSemanticTypeReference[]|null};diagnostics:Diagnostic[];provenance:{origin:'authored';path:string;basis:'explicit-author-declaration'}}
export interface CoreSemanticTypeValueResult {source:Document;identity:CoreSemanticTypeIdentity;checks:SemanticTypeValueResult[];status:'valid'|'invalid'|'unknown';complete:boolean;issues:string[]}
