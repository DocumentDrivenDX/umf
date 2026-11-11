// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {DddReference} from '../extensions/ddd';
import type {ProjectionIssue} from './projection-types';

export interface DddDocumentBindings {
 id:string;schemaId:string;root:DddReference;closedObjects:boolean;
 integer:'json-integer';decimal:'decimal-string';dateTime:'string';bytes:'hex-string';collection:'array';
 relations:Record<string,'embed'|'identity'>;lossPolicy:'strict'|'allow-reported-loss';
}
export interface DddDocumentProjection {
 status:'blocked'|'projected';source:Document;policy:DddDocumentBindings;issues:ProjectionIssue[];
 mappings:{concept:DddReference;mode:'embed'|'identity';targetPointer:string}[];target?:Document;nativeSchema?:string;
}
