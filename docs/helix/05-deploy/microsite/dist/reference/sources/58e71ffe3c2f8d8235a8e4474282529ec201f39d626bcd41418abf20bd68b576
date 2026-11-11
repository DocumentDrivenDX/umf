// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {ProjectionIssue} from './projection-types';

export interface OpenapiJsonSchemaPolicy {
 id:string;schemaId:string;pointer:string;resourceUri?:string;schemaResources?:string[];usage:'schema-only';lossPolicy:'strict'|'allow-reported-loss';
}

export interface OpenapiJsonSchemaProjection {
 status:'blocked'|'projected';source:Document;policy:OpenapiJsonSchemaPolicy;issues:ProjectionIssue[];mappings:{retrievalUri:string;sourcePointer:string;targetPointer:string}[];target?:Document;nativeSchema?:string;
}
