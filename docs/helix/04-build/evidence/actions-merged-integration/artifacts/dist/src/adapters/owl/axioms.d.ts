import { type Document } from '../../model/types';
import type { RdfNode, RdfLiteral } from '../rdf';
type Term = RdfNode | RdfLiteral;
export type OwlSpecialAxiom = {
    kind: 'negativePropertyAssertion';
    node: RdfNode;
    sourceIndividual: RdfNode;
    assertionProperty: RdfNode;
    target: Term;
    targetKind: 'individual' | 'value';
    quadIndexes: number[];
} | {
    kind: 'allDifferent' | 'allDisjointClasses' | 'allDisjointProperties';
    node: RdfNode;
    members: Term[];
    memberPredicate: 'members' | 'distinctMembers';
    quadIndexes: number[];
};
export interface OwlSpecialAxiomView {
    profile: 'owl-special-axioms-1';
    complete: false;
    source: Document;
    blankNodeScope: string;
    axioms: OwlSpecialAxiom[];
    malformed: RdfNode[];
}
/** Exposes OWL RDF encodings that must not be lowered into positive storage edges. */
export declare function getOwlSpecialAxioms(document: Document): OwlSpecialAxiomView;
export {};
