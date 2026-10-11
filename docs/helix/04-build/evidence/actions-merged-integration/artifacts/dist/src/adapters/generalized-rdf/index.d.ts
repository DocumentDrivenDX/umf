import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const GENERALIZED_RDF_EXTENSION = "umf.generalized-rdf";
export declare const generalizedRdfPackage: ExtensionPackage;
export type GeneralizedRdfNode = {
    termType: 'NamedNode' | 'BlankNode';
    value: string;
};
export type GeneralizedRdfLiteral = {
    termType: 'Literal';
    value: string;
    datatype: {
        termType: 'NamedNode';
        value: string;
    };
    language?: string;
};
export interface GeneralizedRdfQuad {
    subject: GeneralizedRdfNode;
    predicate: GeneralizedRdfNode;
    object: GeneralizedRdfNode | GeneralizedRdfLiteral;
    graph: GeneralizedRdfNode | {
        termType: 'DefaultGraph';
        value: '';
    };
}
export declare function generalizedRdfRegistry(): Registry;
export declare function inspectGeneralizedRdfDocument(document: Document): import("../..").Validation;
export declare function importGeneralizedRdfDataset(text: string, options: {
    id: string;
    blankNodeScope?: string;
}): Document;
export declare function exportGeneralizedRdfDataset(document: Document): string;
export declare function getGeneralizedRdfQuads(document: Document): GeneralizedRdfQuad[];
export declare function proposeGeneralizedRdfQuadEdit(document: Document, index: number, replacement: GeneralizedRdfQuad): {
    document: Document;
    validation: import("../..").Validation;
};
