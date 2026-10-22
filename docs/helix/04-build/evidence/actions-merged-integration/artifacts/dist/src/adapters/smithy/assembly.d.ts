import { type Document, type Diagnostic } from '../../model/types';
/** Trusted installed runtime. It must consume only the explicitly supplied files. */
export interface SmithyAssemblyBackend {
    identity: string;
    assemble(files: Record<string, string>, control?: {
        signal?: AbortSignal;
    }): string | Promise<string>;
}
export interface SmithyAssemblyEvent {
    id: string;
    severity: 'SUPPRESSED' | 'NOTE' | 'WARNING' | 'DANGER' | 'ERROR';
    message: string;
    source?: {
        filename: string;
        line: number;
        column: number;
    };
    shapeId?: string;
}
export interface SmithyAssemblyResult {
    status: 'assembled' | 'blocked';
    compiler: string;
    source: Document;
    inputs: {
        file: string;
        dependencyId?: string;
    }[];
    events: SmithyAssemblyEvent[];
    issues: Diagnostic[];
    complete: false;
    limitations: string[];
    model?: Document;
    nativeModel?: string;
}
/** Explicit opt-in adapter for the pinned generated JavaScript module, not arbitrary native code discovery. */
export declare function createSmithyJavaScriptBackend(module: {
    assemble(sourcesJson: string): string;
}): SmithyAssemblyBackend;
export declare function assembleSmithyDocument(document: Document, backend: SmithyAssemblyBackend, options: {
    id: string;
    signal?: AbortSignal;
}): Promise<SmithyAssemblyResult>;
