// SPDX-License-Identifier: MIT OR Apache-2.0
export {default as coreNullabilityOperationV5Schema} from '../../spec/core/nullability-operation-v5.schema.json';
import type {Document,Nullability} from './types';
export interface CoreNullabilityIdentity {module:string;element:string}
export type CoreNullabilityMeaning={state:'known';nullability:Nullability}|{state:'missing'}|{state:'inapplicable'}|{state:'unknown';value:string};
export interface CoreNullabilityInspection {operation:'inspect-core-nullability';version:'7.0.0';source:Document;identity:CoreNullabilityIdentity;path:string;meaning:CoreNullabilityMeaning;provenance:'unverified'}
export interface CoreNullabilityDeclaration {operation:'declare-core-nullability';version:'5.0.0';source:Document;target:Document;identity:CoreNullabilityIdentity;provenance:{origin:'authored';idealPath:string;nullability:Nullability;binding:{id:'umf.core.nullability.authoring';version:'5.0.0'};basis:'explicit-author-declaration';nativePath:null}}
export {default as coreNullabilityOperationSchema} from '../../spec/core/nullability-operation-v5.schema.json';
