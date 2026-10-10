import { type ParquetLogicalInspection } from './logical';
import type { Document } from '../../model/types';
export type ParquetContainer = {
    index: number;
    kind: 'list';
    nullable: boolean;
    repeatedIndex: number;
    elementIndex: number;
    elementNullable: boolean;
    layout: 'two-level' | 'three-level';
} | {
    index: number;
    kind: 'map';
    nullable: boolean;
    repeatedIndex: number;
    keyIndex: number;
    valueIndex?: number;
    valueNullable: boolean;
    duplicateKeys: 'last-value';
};
export interface ParquetContainerInspection extends ParquetLogicalInspection {
    containers?: ParquetContainer[];
}
/** Native reading interpretation only; source structure, names and annotations remain authoritative. */
export declare function inspectParquetContainers(source: Document): ParquetContainerInspection;
