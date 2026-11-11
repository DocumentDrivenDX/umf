// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import schema from '../../spec/core/tablespec-key-classification.schema.json';
import type {TABLESPEC_KEYS_EXTENSION} from './key-tablespec-package';
export {TABLESPEC_KEYS_EXTENSION,tableSpecKeysPackage} from './key-tablespec-package';
export {default as tableSpecKeyClassificationSchema} from '../../spec/core/tablespec-key-classification.schema.json';
export interface TableSpecKeyRequest {mode:'strict'|'report';profile:'declared-metadata'}
export interface TableSpecKeyObservation {
 nativePath:string;kind:'primary'|'alternate';state:'absent'|'empty'|'declared'|'invalid';interpretation:'declared'|'unknown'|'unsupported';
 columns:string[];resolvedFields:{module:string;element:string}[];enforcement:'unknown';authorIntent:'unknown';basis:string;
}
const binding=schema.properties.binding.const;
const recovery='Original native archive retained; no authored key inferred' as const;
export interface TableSpecKeyClassification {
 operation:'classify-tablespec-keys';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';
 source:Document;target?:Document;request:TableSpecKeyRequest;binding:typeof binding;observations:TableSpecKeyObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
