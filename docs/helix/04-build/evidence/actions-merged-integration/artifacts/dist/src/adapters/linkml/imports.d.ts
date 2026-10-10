import { type Document, type Diagnostic } from '../../model/types';
export interface LinkmlImportContext {
    entry: string;
    schemas: {
        key: string;
        document: Document;
    }[];
    bindings: {
        from: string;
        import: string;
        target: string;
    }[];
}
export interface LinkmlImportReport {
    context: LinkmlImportContext;
    status: 'resolved' | 'blocked';
    complete: false;
    nodes: string[];
    edges: {
        from: string;
        import: string;
        path: string;
        target?: string;
    }[];
    diagnostics: Diagnostic[];
}
/** Traverse only caller-supplied import bindings. Does not guess retrieval paths or merge declarations. */
export declare function inspectLinkmlImportContext(input: LinkmlImportContext): LinkmlImportReport;
