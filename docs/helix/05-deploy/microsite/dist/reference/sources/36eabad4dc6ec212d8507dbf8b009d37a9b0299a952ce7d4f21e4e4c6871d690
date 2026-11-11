// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreLiteral} from './schema-literals';
export {default as coreFacetOperationV3Schema} from '../../spec/core/facet-operation-v3.schema.json';
import type {Document} from './types';
export interface CoreFacetIdentity {module:string;element:string}
export interface CoreFacetPatch {length?:{max:number;unit:'unicode-scalar'|'byte'};precision?:number;scale?:number;integerWidth?:{bits:number;signed:boolean}}
export interface CoreFacetInterpreted {length?:{min?:number;max?:number;unit:'unicode-scalar'|'byte'};precision?:number;scale?:number;integerWidth?:{bits:number;signed:boolean};collectionSize?:{min?:number;max?:number};range?:{min?:CoreLiteral;max?:CoreLiteral;minInclusive?:boolean;maxInclusive?:boolean}}
export interface CoreFacets {length?:{min?:number;max?:number;unit:string;[key:string]:unknown};precision?:number;scale?:number;integerWidth?:{bits:number;signed:boolean;[key:string]:unknown};[key:string]:unknown}
export type CoreFacetMeaning={state:'missing'|'inapplicable'}|{state:'known'|'partial';facets:CoreFacets;interpreted:CoreFacetInterpreted;uninterpretedPaths:string[]};
export interface CoreFacetInspection {operation:'inspect-core-facets';version:'5.0.0';source:Document;identity:CoreFacetIdentity;path:string;meaning:CoreFacetMeaning;provenance:'unverified'}
export interface CoreFacetDeclaration {operation:'declare-core-facets';version:'3.0.0';source:Document;target:Document;identity:CoreFacetIdentity;request:CoreFacetPatch;provenance:{origin:'authored';idealPath:string;binding:{id:'umf.core.facets.authoring';version:'3.0.0'};basis:'explicit-author-declaration';nativePath:null}}
export {default as coreFacetOperationSchema} from '../../spec/core/facet-operation-v3.schema.json';
