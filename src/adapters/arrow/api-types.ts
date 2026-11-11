// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Document,Json,Validation} from '../../model/types';

export interface ArrowIpcObservationBackend {identity:'apache-arrow@21.2.0';observe(bytes:Uint8Array):unknown;}
export interface ArrowSchemaIpcBackend {identity:'apache-arrow@21.2.0';encode(schema:unknown):{before:unknown;after:unknown;bytes:Uint8Array};}
export interface ArrowFlatbufferEncodingBackend {identity:'flatbuffers@25.9.23';encode(model:unknown):Uint8Array;}
export type ArrowFlatbufferRoot='Schema'|'Message'|'Footer'|'Tensor'|'SparseTensor';
export interface ArrowFlatbufferDecodeResult {source:Document;model?:Document;complete:false;status:'decoded'|'uninterpreted';diagnostics:Diagnostic[];}
export interface ArrowFlatbufferModelEdit {document:Document;validation:Validation;}
export interface ArrowIpcCaptureInspection extends Validation {complete:false;}
export interface ArrowIpcObservationResult {source:Document;backend:string;complete:false;status:'observed'|'uninterpreted';schema?:Json;message?:string;}
export interface ArrowIpcFrame {offset:number;prefixLength:number;metadataOffset:number;metadataLength:number;bodyOffset:number;bodyLength:number;kind:string;metadata:Document;}
export interface ArrowIpcLayout {source:Document;format:'stream'|'file';complete:false;bytesAccountedFor:boolean;frames:ArrowIpcFrame[];footer?:{offset:number;length:number;metadata:Document};eosOffset?:number;consumed:number;trailingBytes:number;diagnostics:Diagnostic[];}
export interface ArrowIpcConsistency {layout:ArrowIpcLayout;complete:false;footerChecks:'not-applicable'|'matched'|'mismatch'|'unverified';diagnostics:Diagnostic[];}
export interface ArrowIpcRenameResult {source:Document;document:Document;complete:false;bodyBytesPreserved:true;validation:ArrowIpcConsistency;diagnostics:Diagnostic[];}
