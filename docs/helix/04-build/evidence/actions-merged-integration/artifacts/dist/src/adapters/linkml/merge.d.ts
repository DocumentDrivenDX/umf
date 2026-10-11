import { type LinkmlImportContext } from './imports';
import { type Document, type Diagnostic } from '../../model/types';
export declare const LINKML_MERGE_COLLECTIONS: readonly ['prefixes', 'classes', 'slots', 'enums', 'subsets', 'types'];
export interface LinkmlImportMergeReport {
    context: LinkmlImportContext;
    mode: 'view' | 'merge-imports';
    status: 'candidate' | 'blocked';
    complete: false;
    closure: string[];
    selections: {
        collection: string;
        name: string;
        winner: string;
        shadowed: string[];
    }[];
    candidate?: Document;
    diagnostics: Diagnostic[];
}
/** Materialize supplied declarations using an explicitly selected native precedence policy. */
export declare function proposeLinkmlImportMerge(input: LinkmlImportContext, options: {
    mode: 'view' | 'merge-imports';
}): LinkmlImportMergeReport;
