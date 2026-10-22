import { type Document, type Diagnostic } from '../../model/types';
import { type SmithyAssemblyBackend, type SmithyAssemblyResult } from './assembly';
export interface SmithySelectionBackend extends SmithyAssemblyBackend {
    select(modelJson: string, selector: string, control?: {
        signal?: AbortSignal;
    }): string | Promise<string>;
}
export interface SmithySelectionResult {
    status: 'selected' | 'blocked';
    selector: string;
    assembly: SmithyAssemblyResult;
    shapeIds?: string[];
    issues: Diagnostic[];
    complete: false;
}
/** Explicit native shape-set query. Variable environments are not returned by this API. */
export declare function createSmithyJavaScriptSelectionBackend(module: {
    assemble(sourcesJson: string): string;
    select(modelJson: string, selector: string, control?: {
        signal?: AbortSignal;
    }): string;
}): SmithySelectionBackend;
export declare function selectSmithyShapes(document: Document, backend: SmithySelectionBackend, selector: string, options: {
    id: string;
    signal?: AbortSignal;
}): Promise<SmithySelectionResult>;
