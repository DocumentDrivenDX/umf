import { type IcebergTableTransforms } from './table-transforms';
import { type Document } from '../../model/types';
export interface IcebergTablePromotionReport {
    complete: false;
    previousSchemaId: number;
    nextSchemaId: number;
    fieldId: number;
    sourceType: string;
    targetType: string;
    appendedSchemaPath: string;
    checkedPartitionFields: string[];
    bindings: IcebergTableTransforms;
    limitations: string[];
}
/** Metadata candidate for the v1/v2 primitive widening rules, carried in v2/v3 tables. */
export declare function proposeIcebergTablePromotion(document: Document, options: {
    fieldId: number;
    targetType: string;
    nextSchemaId: number;
}): {
    document: Document;
    report: IcebergTablePromotionReport;
};
