// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Document} from '../../model/types';

export interface ProtobufSourceRequest {files:Record<string,string>;roots:string[];}
/** A trusted installed compiler. It must resolve only the explicit source bundle. */
export interface ProtobufSourceCompiler {compile(request:ProtobufSourceRequest):Promise<{descriptorSet:Uint8Array;compiler:string}>;}
/** Explicit source emitter; current descriptor bytes are passed as the sole argument. */
export interface ProtobufSourceEmitter {emit(descriptorSet:Uint8Array):Promise<{files:Record<string,string>;compiler:string;printer:string}>;}
export interface ProtobufSourceExportResult {files:Record<string,string>;compiler:string;printer:string;source:Document;diagnostics:Diagnostic[];[key:string]:unknown;}
