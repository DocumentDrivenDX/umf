import { type Document, type Diagnostic } from '../../model/types';
export interface DbtManifestGraph {
    status: 'checked' | 'blocked';
    complete: false;
    nodes: {
        id: string;
        collection: string;
        path: string;
    }[];
    edges: {
        dependent: string;
        dependency: string;
        kind: 'resource' | 'macro';
        path: string;
        resolved: boolean;
    }[];
    diagnostics: Diagnostic[];
}
/** Explicit manifest references only; edges point from dependent to dependency. */
export declare function inspectDbtManifestGraph(document: Document): DbtManifestGraph;
