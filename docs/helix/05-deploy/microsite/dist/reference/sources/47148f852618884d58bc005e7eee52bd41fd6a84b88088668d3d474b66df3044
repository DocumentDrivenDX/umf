// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {RdfNode,RdfLiteral} from '../rdf';
import type {ShaclPath} from './path-types';

type Term=RdfNode|RdfLiteral;

export interface ShaclMetadataField {
 predicate:string;
 values:Term[];
 quadIndexes:number[];
}

export interface ShaclShapeMetadataNode {
 node:RdfNode;
 annotations:ShaclMetadataField[];
 constraints:ShaclMetadataField[];
 controls:ShaclMetadataField[];
 uninterpreted:ShaclMetadataField[];
 path:{status:'absent'}|{status:'compiled';value:ShaclPath}|{status:'invalid';message:string};
}

export interface ShaclShapeMetadata {
 profile:'shacl-metadata-1';
 complete:false;
 source:Document;
 blankNodeScope:string;
 shape:ShaclShapeMetadataNode;
 properties:ShaclShapeMetadataNode[];
 diagnostics:Diagnostic[];
}
