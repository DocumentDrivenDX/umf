// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreRecordValueCheck} from './record-values-types';
import type {CoreKeyTupleReceipt} from './key-tuple';
import type {CoreDatasetValueCheck,CoreDatasetInput} from './dataset-values-types';

export type CoreCompactRecordValueCheck=Omit<CoreRecordValueCheck,'source'>&{sourceRef:'#/source'};
export type CoreCompactKeyTupleReceipt=Omit<CoreKeyTupleReceipt,'source'>&{sourceRef:'#/source'};
export interface CoreDatasetCompactValueCheck extends Omit<CoreDatasetValueCheck,'operation'|'records'|'keys'|'relationships'>{
 operation:'validate-core-dataset-values-compact';
 records:{instanceId:string;result:CoreCompactRecordValueCheck}[];
 keys:{instanceId:string;result:CoreCompactKeyTupleReceipt}[];
 relationships:{instanceId:string;identity:{module:string;id:string};sourceInstanceId:string;targetInstanceId:string;targetKey:CoreCompactKeyTupleReceipt}[];
}
