// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from './types';
export {encodeCoreKeyTuple,verifyCoreKeyTuple,readCoreKeyTupleBytes,prepareCoreKeyTuples} from '#umf-source';

export interface CoreKeyIdentity {module:string;element:string;key:string}
export type CoreKeyTupleValue={boolean:boolean}|{integerToken:string}|{decimalToken:string}|{string:string}|{binaryHex:string}|{bits128Hex:string}|{uuid:string};
export interface CoreKeyTupleReceipt {operation:'encode-core-key-tuple';version:'4.0.0';profile:'umf-key-tuple-v1'|'umf-key-tuple-v2';source:Json;identity:CoreKeyIdentity;values:CoreKeyTupleValue[];keyPath:string;bytesHex:string}

export interface PreparedCoreKeyTuples {
 readonly profile:'umf.core.key-tuples.prepared/1';
 /** Immutable, private-copy source; this is not a current-store assertion. */
 readonly source:Json;
 encode(identity:CoreKeyIdentity,values:CoreKeyTupleValue[]):CoreKeyTupleReceipt;
 verify(receipt:CoreKeyTupleReceipt):CoreKeyTupleReceipt;
}
