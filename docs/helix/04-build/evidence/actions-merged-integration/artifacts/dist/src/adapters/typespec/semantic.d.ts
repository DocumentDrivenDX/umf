import { type Document, type Json } from '../../model/types';
export interface TypeSpecSemanticNode {
    id: string;
    kind: string;
    label: string;
    attributes: Record<string, Json>;
    edges: {
        role: string;
        target: string;
        name?: string;
        index?: number;
    }[];
    location?: {
        file: string;
        start: number;
        end: number;
    };
}
/** Selected compiled graph snapshot; source remains authoritative for omitted compiler state. */
export declare function getTypeSpecSemanticGraph(document: Document, input: {
    roots: string[];
}): Promise<{
    status: 'available' | 'blocked';
    source: Document;
    compilation: {
        compiler: string;
        libraries: {
            [x: string]: string;
        };
        valid: boolean;
        complete: false;
        diagnostics: {
            code: string;
            severity: import("@typespec/compiler").DiagnosticSeverity;
            message: string;
            file?: string;
            start?: number;
            end?: number;
        }[];
        limitations: string[];
    };
    roots: {
        expression: string;
        target: string;
    }[];
    nodes: TypeSpecSemanticNode[];
    complete: false;
    limitations: string[];
    issues: {
        code: string;
        detail: string;
    }[];
}>;
