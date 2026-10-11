import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage } from '../../model/types';
import { type RdfNode, type RdfLiteral, type RdfQuad } from '../rdf';
export declare const SHACL_EXTENSION = "umf.shacl";
export declare const shaclPackage: ExtensionPackage;
type Value = RdfNode | RdfLiteral;
export type ShaclPath = {
    kind: 'predicate';
    iri: string;
} | {
    kind: 'sequence' | 'alternative';
    paths: ShaclPath[];
} | {
    kind: 'inverse' | 'zeroOrMore' | 'oneOrMore' | 'zeroOrOne';
    path: ShaclPath;
};
export declare function shaclRegistry(): Registry;
export declare function inspectShaclDocument(document: Document): import("../..").Validation;
export declare function importShaclTurtle(text: string, options: {
    id: string;
    baseIRI: string;
    blankNodeScope?: string;
}): Document;
export declare function exportShaclTurtle(document: Document): string;
export declare function getShaclQuads(document: Document): RdfQuad[];
export declare function proposeShaclQuadEdit(document: Document, index: number, replacement: RdfQuad): {
    document: Document;
    validation: import("../..").Validation;
};
/** Compile one property shape's path. The returned tree is metadata, not a conformance report. */
export declare function getShaclPropertyPath(document: Document, shape: RdfNode): ShaclPath;
/** Focus blank labels are local to data. Named datasets require explicit graph selection before this call. */
export declare function evaluateShaclPropertyPath(shapes: Document, shape: RdfNode, data: Document, focus: Value): Value[];
/** SHACL Core target union, before deactivation or constraint evaluation. */
export declare function getShaclTargetNodes(shapes: Document, shape: RdfNode, data: Document): Value[];
export {};
