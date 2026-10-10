import { type Document, type Diagnostic } from '../../model/types';
export interface LinkmlClassSlotsReport {
    source: Document;
    className: string;
    scope: 'document';
    status: 'resolved' | 'blocked';
    complete: false;
    ancestors: string[];
    slots: {
        name: string;
        declarations: {
            className: string;
            path: string;
            kind: 'slot' | 'attribute';
        }[];
    }[];
    diagnostics: Diagnostic[];
}
/** Local class-slot membership only; import merge and induced slot values are separate operations. */
export declare function inspectLinkmlClassSlots(document: Document, className: string): LinkmlClassSlotsReport;
