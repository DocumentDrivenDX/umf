// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../model/types';
import type {RdfLiteral,RdfNode,RdfQuad} from '../rdf';

export type OwlValue=RdfNode|RdfLiteral;
export interface OwlOntologyHeader {node:RdfNode;versionIRIs:OwlValue[];imports:OwlValue[]}
export type OwlEntityKind='class'|'datatype'|'objectProperty'|'dataProperty'|'annotationProperty'|'namedIndividual';
export interface OwlDeclaration {node:RdfNode;kind:OwlEntityKind;quadIndexes:number[]}
export interface OwlDeclarationView {profile:'owl-declarations-1';complete:false;source:Document;blankNodeScope:string;declarations:OwlDeclaration[];anonymousTypeAssertions:OwlDeclaration[]}
export type OwlExpressionDescription=
 |{kind:'reference';node:RdfNode}
 |{kind:'intersectionOf'|'unionOf'|'oneOf';node:RdfNode;members:OwlValue[]}
 |{kind:'complementOf'|'datatypeComplementOf'|'inverseOf';node:RdfNode;operand:OwlValue}
 |{kind:'restriction';node:RdfNode;properties:OwlValue[];facets:{predicate:string;values:OwlValue[]}[]}
 |{kind:'datatypeRestriction';node:RdfNode;datatype:OwlValue;facets:{node:RdfNode;statements:{predicate:string;values:OwlValue[]}[]}[]}
 |{kind:'unrecognized';node:RdfNode};
export interface OwlExpressionView {profile:'owl-expression-1';complete:false;source:Document;blankNodeScope:string;expression:OwlExpressionDescription;quadIndexes:number[]}
export type OwlSpecialAxiom=
 |{kind:'negativePropertyAssertion';node:RdfNode;sourceIndividual:RdfNode;assertionProperty:RdfNode;target:OwlValue;targetKind:'individual'|'value';quadIndexes:number[]}
 |{kind:'allDifferent'|'allDisjointClasses'|'allDisjointProperties';node:RdfNode;members:OwlValue[];memberPredicate:'members'|'distinctMembers';quadIndexes:number[]};
export interface OwlSpecialAxiomView {profile:'owl-special-axioms-1';complete:false;source:Document;blankNodeScope:string;axioms:OwlSpecialAxiom[];malformed:RdfNode[]}
export interface OwlAnnotationRecord {node:RdfNode;kind:'Axiom'|'Annotation';target:{subject:RdfNode;predicate:RdfNode;object:OwlValue};assertedQuadIndexes:number[];annotationQuadIndexes:number[];nested:RdfNode[]}
export interface OwlAxiomAnnotations {profile:'owl-annotations-1';complete:false;source:Document;blankNodeScope:string;quadIndex:number;roots:RdfNode[];records:OwlAnnotationRecord[];malformed:RdfNode[]}
export type OwlListAxiomKind='propertyChain'|'key'|'disjointUnion';
export interface OwlListAxiom {kind:OwlListAxiomKind;node:RdfNode;head:RdfNode;members:RdfNode[];quadIndexes:number[];listQuadIndexes:number[]}
export interface OwlMalformedListAxiom {kind:OwlListAxiomKind;node:RdfNode;head:OwlValue;quadIndexes:number[];reason:string}
export interface OwlListAxiomView {profile:'owl-list-axioms-1';complete:false;source:Document;blankNodeScope:string;axioms:OwlListAxiom[];malformed:OwlMalformedListAxiom[]}

// Type-only facade declarations keep existing consumers source compatible.
export declare function inspectOwlDocument(document:Document):{valid:boolean;complete:boolean;diagnostics:unknown[]};
export declare function importOwlTurtle(text:string,options:{id:string;baseIRI:string;blankNodeScope?:string}):Document;
export declare function exportOwlTurtle(document:Document):string;
export declare function getOwlQuads(document:Document):RdfQuad[];
export declare function proposeOwlQuadEdit(document:Document,index:number,replacement:RdfQuad):{document:Document;validation:unknown};
export declare function getOwlOntologyHeaders(document:Document):OwlOntologyHeader[];
export declare function getOwlExpressionView(document:Document,node:RdfNode):OwlExpressionView;
export declare function getOwlListAxioms(document:Document):OwlListAxiomView;
export declare function getOwlSpecialAxioms(document:Document):OwlSpecialAxiomView;
export declare function getOwlAxiomAnnotations(document:Document,quadIndex:number):OwlAxiomAnnotations;
export declare function getOwlDeclarations(document:Document):OwlDeclarationView;
