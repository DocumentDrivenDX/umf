// SPDX-License-Identifier: MIT OR Apache-2.0
import {coreVocabulary,CURRENT_CORE_VERSION} from '../generated/core-model';
export {CURRENT_CORE_VERSION} from '../generated/core-model';
export type {Json,Document,Module,Element,CoreItemTypeReference,CoreSemanticTypeReference,ExtensionPackage} from '../generated/core-model';
export type JsonObject = { [key: string]: import('../generated/core-model').Json };
export type Scope = 'document' | 'module' | 'element';
/** Shared model-owned current value families; native refinements remain separate. */
export const SCALAR_TYPES=Object.freeze(coreVocabulary.scalarType);
export type ScalarType=typeof SCALAR_TYPES[number];
export const scalarTypesForVersion=(version:string):readonly string[]=>version===CURRENT_CORE_VERSION?SCALAR_TYPES:[];
export const ELEMENT_KINDS=coreVocabulary.kind;
export type ElementKind=typeof ELEMENT_KINDS[number];
export const NULLABILITIES=coreVocabulary.nullability;
export type Nullability=typeof NULLABILITIES[number];
export const CARDINALITIES=coreVocabulary.cardinality;
export type Cardinality=typeof CARDINALITIES[number];
export interface Diagnostic { code: string; path: string; message: string; severity: 'error' | 'warning' }
export interface Validation { valid: boolean; complete: boolean; diagnostics: Diagnostic[] }
export {UmfError,pointer} from './errors';
