import { type Document } from '../../model/types';
import type { RdfNode, RdfLiteral } from '../rdf';
type Term = RdfNode | RdfLiteral;
export type OwlListAxiomKind = 'propertyChain' | 'key' | 'disjointUnion';
export interface OwlListAxiom {
    kind: OwlListAxiomKind;
    node: RdfNode;
    head: RdfNode;
    members: RdfNode[];
    quadIndexes: number[];
    listQuadIndexes: number[];
}
export interface OwlMalformedListAxiom {
    kind: OwlListAxiomKind;
    node: RdfNode;
    head: Term;
    quadIndexes: number[];
    reason: string;
}
export interface OwlListAxiomView {
    profile: 'owl-list-axioms-1';
    complete: false;
    source: Document;
    blankNodeScope: string;
    axioms: OwlListAxiom[];
    malformed: OwlMalformedListAxiom[];
}
/** Source-preserving local RDF list views; never an OWL consistency or inference result. */
export declare function getOwlListAxioms(document: Document): OwlListAxiomView;
export {};
