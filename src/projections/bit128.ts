// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {Bit128BindingPayload} from '../extensions/binding/bit128';
export type Bit128Obligation='bits'|'availability'|'equality'|'ordering'|'enforcement';
export interface Bit128ProjectionPolicy {lossPolicy:'strict'|'report';obligations:Bit128Obligation[]}
export interface Bit128NativeProjection {
 operation:'project-bit128-carrier-schema';version:'1.0.0';source:Document;binding:Document;identity:{module:string;element:string};policy:Bit128ProjectionPolicy;
 outcomes:{obligation:Bit128Obligation;outcome:'exact'|'unknown'|'not-expressible';reason:string}[];
 diagnostics:Diagnostic[];mapping:{idealPath:string;targetSlots:string[];bindingVersion:'0.3.0';target:Bit128BindingPayload['target']};
 status:'projected'|'reported'|'blocked';candidate?:{format:'sql'|'avro'|'parquet'|'tablespec';text:string};
}
export interface Bit128NativeTypeInput {system:'postgresql'|'sqlserver'|'avro'|'parquet';version:string;definition:Json}
