// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreCardinalityDeclaration} from '../model/cardinality';
import type {ParquetCardinalityCarrier} from './parquet-cardinality-carrier';
export type {ParquetCardinalityCarrier} from './parquet-cardinality-carrier';
import schema from '../../spec/core/cardinality-parquet-projection.schema.json';
export {default as cardinalityParquetProjectionSchema} from '../../spec/core/cardinality-parquet-projection.schema.json';
export interface CardinalityParquetRequest {id:string;recordName:string;fieldName:string;nativeType:ParquetCardinalityCarrier;availability:'definition-level'|'unresolved';requireExactValues:boolean;mode:'strict'|'report';}
const binding=schema.properties.binding.const;
export interface CardinalityParquetProjection {
 operation:'project-cardinality-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreCardinalityDeclaration;request:CardinalityParquetRequest;target?:Document;binding:typeof binding;
 mapping:{origin:'authored';idealPath:string;cardinality:'one'|'array'|'map'|'unspecified';outcome:'exact'|'approximated'|'unknown'|'not-expressible';items:{idealPath:string;nativeIndex:number}[]};
 residuals:{path:string;value:Json;reason:string;outcome:'approximated'|'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];diagnostics:Diagnostic[];
}
