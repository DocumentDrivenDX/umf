import { type Document } from '../../model/types';
import type { RdfNode, RdfLiteral } from '../rdf';
type Term = RdfNode | RdfLiteral;
export interface OwlAnnotationRecord {
    node: RdfNode;
    kind: 'Axiom' | 'Annotation';
    target: {
        subject: RdfNode;
        predicate: RdfNode;
        object: Term;
    };
    assertedQuadIndexes: number[];
    annotationQuadIndexes: number[];
    nested: RdfNode[];
}
export interface OwlAxiomAnnotations {
    profile: 'owl-annotations-1';
    complete: false;
    source: Document;
    blankNodeScope: string;
    quadIndex: number;
    roots: RdfNode[];
    records: OwlAnnotationRecord[];
    malformed: RdfNode[];
}
/** Match RDF reification terms exactly, retaining nested annotation links as a finite graph. */
export declare function getOwlAxiomAnnotations(document: Document, quadIndex: number): OwlAxiomAnnotations;
export {};
