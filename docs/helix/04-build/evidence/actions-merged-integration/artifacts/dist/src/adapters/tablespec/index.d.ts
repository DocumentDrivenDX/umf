import { type NativeJson } from '../../model/native-json';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const TABLESPEC_EXTENSION = "umf.tablespec";
export declare const tablespecPackage: ExtensionPackage;
export declare function importTableSpec(text: string, options: {
    id: string;
    format: 'json' | 'yaml';
}): Document;
export declare function inspectTableSpec(document: Document): import("../..").Validation;
export declare function exportTableSpec(document: Document): string;
export declare function getTableSpecColumn(document: Document, index: number): NativeJson;
/** Copy the captured table view, including unknown native metadata and exact numbers.
 * Split sidecars and shadowed content remain in the document's source archive.
 * This is inspection, not native validation or a flattened split-file export.
 */
export declare function getTableSpecTable(document: Document): NativeJson;
/** Merge explicit native field changes on a copy, retaining unspecified fields. */
export declare function editTableSpecColumn(document: Document, index: number, changes: Record<string, NativeJson>): Document;
/** Merge explicit table metadata; column ordering/identity requires separate operations. */
export declare function editTableSpecTable(document: Document, changes: Record<string, NativeJson>): Document;
/** Captures all files; the metadata view does not execute loader migrations. */
export declare function importTableSpecBundle(files: Record<string, string>, options: {
    id: string;
}): Document;
export declare function exportTableSpecBundle(document: Document): Record<string, string>;
