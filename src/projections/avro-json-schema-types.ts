// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {ProjectionIssue} from './projection-types';

export interface AvroDocumentBindings {
 id:string;schemaId:string;long:'decimal-string';bytes:'hex-string';union:'untagged';lossPolicy:'strict'|'allow-reported-loss';
}
export interface AvroDocumentProjection {
 status:'blocked'|'projected';source:Document;policy:AvroDocumentBindings;issues:ProjectionIssue[];
 mappings:{name:string;sourcePath:string;targetPointer:string}[];target?:Document;nativeSchema?:string;
}
