import { type ParquetMetadataInspection } from './metadata';
import type { Document } from '../../model/types';
export interface ParquetSchemaNode {
    index: number;
    name: string;
    path: string[];
    definitionLevel: number;
    repetitionLevel: number;
    children: ParquetSchemaNode[];
}
export interface ParquetSchemaLeaf {
    index: number;
    ordinal: number;
    path: string[];
    physicalType: string;
    definitionLevel: number;
    repetitionLevel: number;
}
export interface ParquetSchemaInspection extends Omit<ParquetMetadataInspection, 'status'> {
    status: 'checked' | 'blocked';
    tree?: ParquetSchemaNode;
    leaves?: ParquetSchemaLeaf[];
}
/** Checks physical schema topology and available row-group column links, not logical semantics. */
export declare function inspectParquetSchema(source: Document): ParquetSchemaInspection;
