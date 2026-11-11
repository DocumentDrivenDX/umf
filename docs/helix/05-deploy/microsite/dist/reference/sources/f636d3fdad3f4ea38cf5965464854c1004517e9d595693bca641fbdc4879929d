// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import schema from '../../spec/core/parquet-key-classification.schema.json';
import type {PARQUET_KEYS_EXTENSION} from './parquet-key-package';
export {PARQUET_KEYS_EXTENSION,parquetKeysPackage,parquetKeyClassificationSchema} from './parquet-key-package';
export interface ParquetKeyRequest {mode:'strict'|'report';profile:'file-schema'}
export interface ParquetKeyObservation {nativePath:string;index:number;path:string[];kind:'physical-leaf'|'physical-group';definitionLevel:number;repetitionLevel:number;nativeField:Json;enforcement:'not-expressible';authorIntent:'unknown';provenance:'inferred';scope:'file-schema'}
const binding=schema.properties.binding.const,recovery='Original native archive retained; no authored key inferred' as const;
export interface ParquetKeyClassification {operation:'classify-parquet-keys';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetKeyRequest;binding:typeof binding;observations:ParquetKeyObservation[];residuals:{path:string;value:Json;outcome:'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[]}
