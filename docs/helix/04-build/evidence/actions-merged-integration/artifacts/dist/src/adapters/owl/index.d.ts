import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage } from '../../model/types';
import { type RdfNode, type RdfLiteral, type RdfQuad } from '../rdf';
export declare const OWL_EXTENSION = "umf.owl";
export declare const owlPackage: ExtensionPackage;
export declare function owlRegistry(): Registry;
export declare function inspectOwlDocument(document: Document): import("../..").Validation;
export declare function importOwlTurtle(text: string, options: {
    id: string;
    baseIRI: string;
    blankNodeScope?: string;
}): Document;
export declare function exportOwlTurtle(document: Document): string;
export declare function getOwlQuads(document: Document): RdfQuad[];
export declare function proposeOwlQuadEdit(document: Document, index: number, replacement: RdfQuad): {
    document: Document;
    validation: import("../..").Validation;
};
export interface OwlOntologyHeader {
    node: RdfNode;
    versionIRIs: (RdfNode | RdfLiteral)[];
    imports: (RdfNode | RdfLiteral)[];
}
export declare function getOwlOntologyHeaders(document: Document): OwlOntologyHeader[];
