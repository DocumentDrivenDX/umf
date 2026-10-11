import { type Document, type Json, type Cardinality, type ScalarType } from '../model/types';
import { type ParquetContainer } from '../adapters/parquet/containers';
export interface ParquetCardinalityNode {
    index: number;
    path: string[];
    nativeFragment: Json;
    shape: Cardinality;
    role: 'scalar' | 'record' | 'array' | 'map' | 'unresolved';
    nativeNullable: boolean | null;
    scalarType?: ScalarType;
    itemIndex?: number;
    recordMembers?: number[];
    container?: ParquetContainer;
    residuals: {
        path: string;
        reason: string;
    }[];
}
export interface ParquetCardinalityShape {
    index: number;
    nodes: ParquetCardinalityNode[];
}
/** Internal present-value shape interpretation. Does not publish core assertions or decode rows. */
export declare function inspectParquetCardinalityShape(source: Document, index: number): ParquetCardinalityShape;
