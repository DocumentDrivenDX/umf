// SPDX-License-Identifier: MIT OR Apache-2.0
import type {GENERALIZED_RDF_EXTENSION,generalizedRdfPackage} from './package';
export {GENERALIZED_RDF_EXTENSION,generalizedRdfPackage} from './package';
export type GeneralizedRdfNode={termType:'NamedNode'|'BlankNode';value:string};
export type GeneralizedRdfLiteral={termType:'Literal';value:string;datatype:{termType:'NamedNode';value:string};language?:string};
export interface GeneralizedRdfQuad {subject:GeneralizedRdfNode;predicate:GeneralizedRdfNode;object:GeneralizedRdfNode|GeneralizedRdfLiteral;graph:GeneralizedRdfNode|{termType:'DefaultGraph';value:''}}
