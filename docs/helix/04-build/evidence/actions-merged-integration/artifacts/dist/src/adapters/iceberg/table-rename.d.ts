import { type IcebergTableTransforms } from './table-transforms';
import { type Document } from '../../model/types';
export interface IcebergTableRenameReport {
    complete: false;
    previousSchemaId: number;
    nextSchemaId: number;
    fieldId: number;
    oldName: string;
    newName: string;
    appendedSchemaPath: string;
    bindings: IcebergTableTransforms;
    limitations: string[];
}
/** Appends a reviewable schema version, never commits or rewrites historical schemas. */
export declare function proposeIcebergTableRename(document: Document, options: {
    fieldId: number;
    newName: string;
    nextSchemaId: number;
}): {
    document: Document;
    report: IcebergTableRenameReport;
};
