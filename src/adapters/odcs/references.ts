// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
export interface OdcsReferenceResult {
 source:Document;reference:string;usage:'element'|'foreignKey';status:'resolved'|'blocked';complete:false;
 target?:{path:string;notation:'id'|'name';node:NativeJson};diagnostics:Diagnostic[];
}
