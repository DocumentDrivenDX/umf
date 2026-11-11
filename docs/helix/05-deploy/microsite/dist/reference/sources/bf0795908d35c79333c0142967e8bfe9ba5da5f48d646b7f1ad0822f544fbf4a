// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import {SQLSERVER_KEYS_EXTENSION,sqlserverKeysPackage,sqlserverKeyClassificationSchema} from './key-sqlserver-package';
export {SQLSERVER_KEYS_EXTENSION,sqlserverKeysPackage,sqlserverKeyClassificationSchema};
const schema=sqlserverKeyClassificationSchema;
export interface SqlServerKeyRequest {nativeSource:string;mode:'strict'|'report';profile:'captured-stored-values'}
export interface SqlServerKeyObservation {
 identity:{schema:string;table:string;indexId:number;name:string|null};nativePath:string;fields:{module:string;element:string}[];primary:boolean;
 enforcement:'immediate-unique-nonnull'|'conditional'|'nullable'|'not-unique'|'unavailable'|'unknown';equality:'exact-on-representable-values'|'incompatible'|'unknown';ignoreDuplicateKey:boolean;authorIntent:'unknown';provenance:'inferred';scope:'captured-table-stored-values';reasons:string[];
}
const binding=schema.properties.binding.const,recovery='Original native catalog retained; authored key intent is not inferred' as const;
export interface SqlServerKeyClassification {
 operation:'classify-sqlserver-keys';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';source:Document;target?:Document;request:SqlServerKeyRequest;binding:typeof binding;observations:SqlServerKeyObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
