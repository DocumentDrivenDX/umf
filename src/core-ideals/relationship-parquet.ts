// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import schema from '../../spec/core/parquet-relationship-classification.schema.json';
import type {PARQUET_RELATIONSHIPS_EXTENSION} from './relationship-parquet-package';
export {PARQUET_RELATIONSHIPS_EXTENSION,parquetRelationshipsPackage} from './relationship-parquet-package';
export {default as parquetRelationshipClassificationSchema} from '../../spec/core/parquet-relationship-classification.schema.json';
export interface ParquetRelationshipRequest {mode:'strict'|'report';profile:'file-schema'}
export interface ParquetRelationshipObservation {nativePath:string;index:number;path:string[];kind:'physical-leaf'|'physical-group';definitionLevel:number;repetitionLevel:number;nativeField:Json;enforcement:'not-expressible';authorIntent:'unknown';provenance:'inferred';scope:'file-schema'}
const binding=schema.properties.binding.const,recovery='Original native archive retained; no authored relationship inferred' as const;
export interface ParquetRelationshipClassification {operation:'classify-parquet-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetRelationshipRequest;binding:typeof binding;observations:ParquetRelationshipObservation[];residuals:{path:string;value:Json;outcome:'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[]}
