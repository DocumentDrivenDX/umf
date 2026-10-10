import { type ParquetSchemaInspection } from './schema';
import type { Document, Json } from '../../model/types';
export interface ParquetLogicalAnnotation {
    index: number;
    origin: 'logical' | 'converted';
    name: string;
    parameters: Json;
    validation: 'checked' | 'uninterpreted' | 'invalid';
}
export interface ParquetLogicalInspection extends ParquetSchemaInspection {
    annotations?: ParquetLogicalAnnotation[];
}
/** Logical schema rules only: never inspects or coerces stored values. */
export declare function inspectParquetLogicalTypes(source: Document): ParquetLogicalInspection;
