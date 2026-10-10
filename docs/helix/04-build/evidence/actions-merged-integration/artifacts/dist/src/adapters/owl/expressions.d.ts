import { type Document } from '../../model/types';
import type { RdfNode, RdfLiteral } from '../rdf';
type Term = RdfNode | RdfLiteral;
export type OwlExpressionDescription = {
    kind: 'reference';
    node: RdfNode;
} | {
    kind: 'intersectionOf' | 'unionOf' | 'oneOf';
    node: RdfNode;
    members: Term[];
} | {
    kind: 'complementOf' | 'datatypeComplementOf' | 'inverseOf';
    node: RdfNode;
    operand: Term;
} | {
    kind: 'restriction';
    node: RdfNode;
    properties: Term[];
    facets: {
        predicate: string;
        values: Term[];
    }[];
} | {
    kind: 'datatypeRestriction';
    node: RdfNode;
    datatype: Term;
    facets: {
        node: RdfNode;
        statements: {
            predicate: string;
            values: Term[];
        }[];
    }[];
} | {
    kind: 'unrecognized';
    node: RdfNode;
};
export interface OwlExpressionView {
    profile: 'owl-expression-1';
    complete: false;
    source: Document;
    blankNodeScope: string;
    expression: OwlExpressionDescription;
    quadIndexes: number[];
}
/** Local RDF constructor view, not a recursive OWL DL parse or a reasoning result. */
export declare function getOwlExpressionView(document: Document, node: RdfNode): OwlExpressionView;
export {};
