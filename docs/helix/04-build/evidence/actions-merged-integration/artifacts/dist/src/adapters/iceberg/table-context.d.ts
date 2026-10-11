import { type Document, type Diagnostic } from '../../model/types';
export interface IcebergTableContext {
    status: 'checked' | 'blocked';
    complete: false;
    scope: 'iceberg-v1-v3-current-references';
    resolved: Record<string, string>;
    diagnostics: Diagnostic[];
}
/** Checks only retained identities and current selections; never mutates or normalizes metadata. */
export declare function inspectIcebergTableContext(document: Document): IcebergTableContext;
