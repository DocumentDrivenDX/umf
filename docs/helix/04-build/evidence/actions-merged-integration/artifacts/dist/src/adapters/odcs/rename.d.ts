import { type Document, type Diagnostic } from '../../model/types';
export interface OdcsRenameResult {
    source: Document;
    status: 'candidate' | 'blocked';
    complete: false;
    candidate?: Document;
    changes: {
        path: string;
        before: string;
        after: string;
    }[];
    diagnostics: Diagnostic[];
}
/** Rename an ID-selected element while preserving the currently resolved local foreign-key endpoints. */
export declare function proposeOdcsElementRename(document: Document, options: {
    reference: string;
    name: string;
}): OdcsRenameResult;
