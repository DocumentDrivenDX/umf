import { type Document, type Diagnostic } from '../../model/types';
export interface OdcsRelationshipReport {
    source: Document;
    status: 'checked' | 'blocked';
    complete: false;
    relationships: {
        path: string;
        scope: 'schema' | 'property';
        status: 'resolved' | 'blocked';
        pairs: {
            fromPath: string;
            toPath: string;
        }[];
        diagnostics: Diagnostic[];
    }[];
    diagnostics: Diagnostic[];
}
/** Local endpoint pairing, not execution of referential-integrity constraints. */
export declare function inspectOdcsRelationships(document: Document, options?: {
    maxRelationships?: number;
}): OdcsRelationshipReport;
