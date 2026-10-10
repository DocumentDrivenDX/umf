import { Registry } from '../../registry/registry';
import { type Document, type Diagnostic, type ExtensionPackage } from '../../model/types';
export declare const RDF_EXTENSION = "umf.rdf";
export declare const rdfPackage: ExtensionPackage;
export type RdfNode = {
    kind: 'iri' | 'blank';
    value: string;
};
export type RdfLiteral = {
    kind: 'literal';
    value: string;
    datatype: string;
    language?: string;
};
export interface RdfQuad {
    subject: RdfNode;
    predicate: {
        kind: 'iri';
        value: string;
    };
    object: RdfNode | RdfLiteral;
    graph: RdfNode | {
        kind: 'default';
    };
}
export declare function rdfRegistry(): Registry;
export declare function inspectRdfDocument(document: Document): import("../..").Validation;
export declare function importRdfNQuads(text: string, options: {
    id: string;
    blankNodeScope?: string;
}): Document;
export declare function getRdfQuads(document: Document): RdfQuad[];
export declare function exportRdfNQuads(document: Document, options?: {
    preserveSource?: boolean;
}): string;
export declare function proposeRdfQuadEdit(document: Document, index: number, replacement: RdfQuad): {
    document: Document;
    validation: import("../..").Validation;
};
export interface RdfIriRenameReport {
    source: Document;
    from: string;
    to: string;
    status: 'candidate' | 'blocked';
    complete: false;
    changes: {
        path: string;
        before: string;
        after: string;
    }[];
    candidate?: Document;
    diagnostics: Diagnostic[];
}
/** Explicit identity change, never a claim that the renamed IRI denotes the same resource. */
export declare function proposeRdfIriRename(document: Document, options: {
    from: string;
    to: string;
}): RdfIriRenameReport;
export declare function importRdfTurtle(text: string, options: {
    id: string;
    baseIRI: string;
    blankNodeScope?: string;
}): Document;
export declare function exportRdfTurtle(document: Document): string;
export declare function getRdfNamedGraphs(document: Document): RdfNode[];
export declare function importRdfTriG(text: string, options: {
    id: string;
    baseIRI: string;
    blankNodeScope?: string;
}): Document;
export declare function exportRdfTriG(document: Document): string;
export interface RdfMergeReport {
    sources: Document[];
    id: string;
    graphPolicy: 'union-by-name';
    blankNodePolicy: 'disjoint-inputs';
    status: 'candidate' | 'blocked';
    complete: false;
    candidate?: Document;
    blankNodes: {
        input: number;
        before: string;
        after: string;
    }[];
    quadOrigins: {
        input: number;
        sourceIndex: number;
        targetIndex: number;
    }[];
    diagnostics: Diagnostic[];
}
/** Explicit dataset composition policy; equal blankNodeScope strings never establish shared identity. */
export declare function proposeRdfDatasetMerge(documents: Document[], options: {
    id: string;
    graphPolicy: 'union-by-name';
    blankNodePolicy: 'disjoint-inputs';
}): RdfMergeReport;
