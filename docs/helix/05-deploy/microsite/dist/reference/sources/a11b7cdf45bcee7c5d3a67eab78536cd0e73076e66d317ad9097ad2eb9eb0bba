// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,ScalarType} from './types';
export interface CoreScalarTypeIdentity {module:string;element:string}
export type CoreScalarTypeMeaning={state:'known';scalarType:ScalarType}|{state:'unknown';value:string}|{state:'missing'}|{state:'inapplicable';authoredScalarType?:string};
export interface CoreScalarTypeInspection {operation:'inspect-core-scalar-type';version:'0.3.0';source:Document;identity:CoreScalarTypeIdentity;path:string;meaning:CoreScalarTypeMeaning;provenance:'unverified'}
