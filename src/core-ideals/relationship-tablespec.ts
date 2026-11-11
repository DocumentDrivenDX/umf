// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {NativeJson} from '../model/native-json';
import schema from '../../spec/core/tablespec-relationship-classification.schema.json';
import type {TABLESPEC_RELATIONSHIPS_EXTENSION} from './relationship-tablespec-package';
export {TABLESPEC_RELATIONSHIPS_EXTENSION,tableSpecRelationshipsPackage} from './relationship-tablespec-package';
export {default as tableSpecRelationshipClassificationSchema} from '../../spec/core/tablespec-relationship-classification.schema.json';
export interface TableSpecRelationshipRequest {mode:'strict'|'report';profile:'declared-metadata'}
export interface TableSpecRelationshipObservation {
 nativePath:string;carrier:'foreign_keys'|'outgoing'|'referenced_by'|'incoming'|'unknown';state:'declared'|'invalid'|'unknown';
 native:NativeJson;sourceColumn:string|null;targetTable:string|null;targetColumn:string|null;
 resolvedSource:{module:string;element:string}|null;enforcement:'unknown';authorIntent:'unknown';basis:string;
}
const binding=schema.properties.binding.const;
const recovery='Original native archive retained; no authored relationship inferred' as const;
export interface TableSpecRelationshipClassification {
 operation:'classify-tablespec-relationships';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';
 source:Document;target?:Document;request:TableSpecRelationshipRequest;binding:typeof binding;observations:TableSpecRelationshipObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
