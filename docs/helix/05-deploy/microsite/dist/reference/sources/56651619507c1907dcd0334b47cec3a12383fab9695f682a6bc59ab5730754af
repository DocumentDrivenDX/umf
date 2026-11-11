// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {RDF_EXTENSION,rdfPackage} from './package';
export {RDF_EXTENSION,rdfPackage} from './package';
export type RdfNode={kind:'iri'|'blank';value:string};
export type RdfLiteral={kind:'literal';value:string;datatype:string;language?:string};
export interface RdfQuad {subject:RdfNode;predicate:{kind:'iri';value:string};object:RdfNode|RdfLiteral;graph:RdfNode|{kind:'default'}}
export interface RdfIriRenameReport {
 source:Document;from:string;to:string;status:'candidate'|'blocked';complete:false;
 changes:{path:string;before:string;after:string}[];candidate?:Document;diagnostics:Diagnostic[];
}
export interface RdfMergeReport {
 sources:Document[];id:string;graphPolicy:'union-by-name';blankNodePolicy:'disjoint-inputs';
 status:'candidate'|'blocked';complete:false;candidate?:Document;
 blankNodes:{input:number;before:string;after:string}[];
 quadOrigins:{input:number;sourceIndex:number;targetIndex:number}[];
 diagnostics:Diagnostic[];
}
