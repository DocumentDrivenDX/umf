// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import {SQLSERVER_RELATIONSHIPS_EXTENSION,sqlserverRelationshipsPackage,sqlserverRelationshipClassificationSchema as schema} from './relationship-sqlserver-package';
export {SQLSERVER_RELATIONSHIPS_EXTENSION,sqlserverRelationshipsPackage};
export {sqlserverRelationshipClassificationSchema} from './relationship-sqlserver-package';
export interface SqlServerRelationshipRequest {nativeSource:string;mode:'strict'|'report';profile:'captured-foreign-keys'}
export interface SqlServerRelationshipObservation {nativePath:string;table:{schema:string;name:string};name:string;nativeForeignKey:Json;referencedKeys:{path:string;nativeKey:Json}[];sourceFields:{module:string;element:string}[];targetFields:{module:string;element:string}[];enforcement:'enabled-trusted'|'enabled-untrusted'|'disabled'|'unknown';authorIntent:'unknown';provenance:'inferred';deleteAction:string;updateAction:string;notForReplication:boolean;resolution:'captured-tuple-candidate'|'unresolved'}
const binding=schema.properties.binding.const;
export interface SqlServerRelationshipClassification {operation:'classify-sqlserver-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerRelationshipRequest;binding:typeof binding;observations:SqlServerRelationshipObservation[];residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible'|'approximated';recovery:string}[];diagnostics:Diagnostic[]}
