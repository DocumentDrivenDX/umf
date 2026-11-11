// SPDX-License-Identifier: MIT OR Apache-2.0
export {default as coreKindOperationV6Schema} from '../../spec/core/kind-operation-v6.schema.json';
import type {Document,ElementKind} from './types';
export {default as coreKindOperationSchema} from '../../spec/core/kind-operation-v6.schema.json';
export interface CoreKindIdentity {module:string;element:string}
export type CoreKindMeaning={state:'known';kind:ElementKind}|{state:'unspecified'}|{state:'unknown';value:string};
export interface CoreKindInspection {operation:'inspect-core-kind';version:'8.0.0';source:Document;identity:CoreKindIdentity;path:string;meaning:CoreKindMeaning;provenance:'unverified'}
export interface CoreKindDeclaration {operation:'declare-core-kind';version:'6.0.0';source:Document;target:Document;identity:CoreKindIdentity;provenance:{origin:'authored';idealPath:string;kind:ElementKind;binding:{id:'umf.core.kind.authoring';version:'6.0.0'};basis:'explicit-author-declaration';nativePath:null}}
