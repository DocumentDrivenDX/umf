// SPDX-License-Identifier: MIT OR Apache-2.0
export {default as coreCardinalityOperationV4Schema} from '../../spec/core/cardinality-operation-v4.schema.json';
import type {Document,Cardinality,CoreItemTypeReference} from './types';
export interface CoreCardinalityIdentity {module:string;element:string}
export type CoreCardinalityMeaning={state:'known';cardinality:Cardinality;itemType?:CoreItemTypeReference}|{state:'missing'}|{state:'inapplicable'}|{state:'unknown';value:string};
export interface CoreCardinalityInspection {operation:'inspect-core-cardinality';version:'6.0.0';source:Document;identity:CoreCardinalityIdentity;path:string;meaning:CoreCardinalityMeaning;provenance:'unverified'}
export interface CoreCardinalityRequest {cardinality:Cardinality;itemType?:CoreItemTypeReference|null}
export interface CoreCardinalityDeclaration {operation:'declare-core-cardinality';version:'4.0.0';source:Document;target:Document;identity:CoreCardinalityIdentity;request:CoreCardinalityRequest;provenance:{origin:'authored';idealPath:string;cardinality:Cardinality;binding:{id:'umf.core.cardinality.authoring';version:'4.0.0'};basis:'explicit-author-declaration';nativePath:null}}
export {default as coreCardinalityOperationSchema} from '../../spec/core/cardinality-operation-v4.schema.json';
