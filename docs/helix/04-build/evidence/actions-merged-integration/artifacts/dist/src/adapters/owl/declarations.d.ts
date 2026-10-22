import type { Document } from '../../model/types';
import type { RdfNode } from '../rdf';
export type OwlEntityKind = 'class' | 'datatype' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'namedIndividual';
export interface OwlDeclaration {
    node: RdfNode;
    kind: OwlEntityKind;
    quadIndexes: number[];
}
export interface OwlDeclarationView {
    profile: 'owl-declarations-1';
    complete: false;
    source: Document;
    blankNodeScope: string;
    declarations: OwlDeclaration[];
    anonymousTypeAssertions: OwlDeclaration[];
}
/** Explicit graph declarations only; multiple roles remain separate and unvalidated. */
export declare function getOwlDeclarations(document: Document): OwlDeclarationView;
