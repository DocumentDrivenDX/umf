import { type DbtManifestGraph } from './graph';
import { type Document, type Diagnostic } from '../../model/types';
export interface DbtDependencySelection {
    source: Document;
    selection: {
        status: 'selected' | 'blocked';
        complete: false;
        roots: string[];
        includeMacros: boolean;
        maxDepth: number;
        maxNodes: number;
        nodes: (DbtManifestGraph['nodes'][number] & {
            depth: number;
        })[];
        edges: DbtManifestGraph['edges'];
        boundary: {
            edge: DbtManifestGraph['edges'][number];
            reason: 'macro-excluded' | 'depth-limit' | 'node-limit';
        }[];
        diagnostics: Diagnostic[];
    };
}
/** Upstream context selection. Full source accompanies the bounded view; this is not a runnable manifest subset. */
export declare function selectDbtManifestDependencies(document: Document, options: {
    roots: string[];
    includeMacros?: boolean;
    maxDepth?: number;
    maxNodes?: number;
}): DbtDependencySelection;
