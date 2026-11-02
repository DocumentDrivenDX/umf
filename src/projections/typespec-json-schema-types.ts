// SPDX-License-Identifier: MIT OR Apache-2.0
import type {JsonObject} from '../model/types';

/** Policy passed to the native TypeSpec JSON Schema emitter adapter. */
export interface TypeSpecJsonSchemaPolicy {
 id:string;rootFile:string;retrievalBase:string;options:JsonObject;
 usage:'native-emission';lossPolicy:'strict'|'allow-reported-loss';
}
