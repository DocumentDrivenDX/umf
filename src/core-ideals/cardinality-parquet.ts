// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Cardinality} from '../model/types';
import type {ParquetCardinalityNode} from './parquet-cardinality-shape';
import schema from '../../spec/core/parquet-cardinality-classification.schema.json';
import type {PARQUET_CARDINALITY_EXTENSION} from './cardinality-parquet-package';
export {PARQUET_CARDINALITY_EXTENSION,parquetCardinalityPackage,parquetCardinalityClassificationSchema} from './cardinality-parquet-package';
export interface ParquetCardinalityRequest {index:number;identity:{module:string;element:string};profile:'present-value-schema'|'unresolved';mode:'strict'|'report';}
const binding=schema.properties.binding.const,basis=binding.subset;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
type Node=ParquetCardinalityNode&{identity:{module:string;element:string}};
export interface ParquetCardinalityClassification {
 operation:'classify-parquet-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';cardinality:Cardinality;outcome:'exact'|'approximated'|'unknown';basis:typeof basis;nodes:Node[]};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
