// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreRecordValueCheck,CoreRecordValueIdentity,CoreRecordFieldValue} from './record-values-types';
import type {CoreKeyIdentity,CoreKeyTupleValue,CoreKeyTupleReceipt} from './key-tuple';
import type {Document,Diagnostic,Json,Validation} from './types';

export interface CoreDatasetRecord {instanceId:string;identity:CoreRecordValueIdentity;values:CoreRecordFieldValue[]}
export interface CoreDatasetRelationship {instanceId:string;identity:{module:string;id:string};sourceInstanceId:string;target:{identity:CoreKeyIdentity;values:CoreKeyTupleValue[]}}
export interface CoreDatasetInput {scope:{id:string;closure:'supplied-dataset-only'};records:CoreDatasetRecord[];relationships:CoreDatasetRelationship[];context?:Json}
export interface CoreDatasetValueCheck {
 operation:'validate-core-dataset-values';version:'1.0.0';scope:'supplied-dataset-only';provenance:'unverified';
 source:Document;input:CoreDatasetInput;documentValidation:Validation;
 records:{instanceId:string;result:CoreRecordValueCheck}[];
 keys:{instanceId:string;result:CoreKeyTupleReceipt}[];
 relationships:{instanceId:string;identity:{module:string;id:string};sourceInstanceId:string;targetInstanceId:string;targetKey:CoreKeyTupleReceipt}[];
 datasetValidation:Validation;obligations:{id:'dataset.keys'|'dataset.relationships';state:'satisfied'|'invalid'|'unresolved';scope:'supplied-dataset-only'}[];
 residuals:{path:string;value:Json;reason:string}[];
}
