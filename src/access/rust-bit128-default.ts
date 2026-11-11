// SPDX-License-Identifier: MIT OR Apache-2.0
import {BIT128_PROFILE,type Bit128Value} from '../model/bit128-types';
import type {UuidValue} from '../model/uuid';
import {UmfError} from '../model/errors';
import type {Bit128NativeTypeInput,Bit128ProjectionPolicy,Bit128NativeProjection} from '../projections/bit128';
import type {Bit128ModelProjection} from '../projections/bit128-model';
import type {Bit128RecordValue} from '../extensions/binding/bit128-record';
import type {Json} from '../model/types';
import type {Document,Validation} from '../model/types';
import type {CoreLiteral} from '../model/schema-literals';

export {BIT128_PROFILE};

/** Structural surface implemented by both Node createBit128Engine and WASM initializeBit128Wasm. */
export interface Bit128RustEngine {
 inspectBit128Binding(binding:Document,logical:Document):unknown;
 encodeBit128CarrierValue(binding:Document,logical:Document,identity:{module:string;element:string},literal:CoreLiteral):unknown;
 decodeBit128CarrierValue(binding:Document,logical:Document,identity:{module:string;element:string},slots:Record<string,string|null>):unknown;
 encodeBit128Record(binding:Document,logical:Document,identity:{module:string;element:string},values:Bit128RecordValue[]):unknown;
 decodeBit128Record(binding:Document,logical:Document,identity:{module:string;element:string},slots:Record<string,string|null>):unknown;
 projectBit128Model(binding:Document,logical:Document,lossPolicy:'strict'|'report'):unknown;
 recoverBit128ModelProjection(report:Bit128ModelProjection,text:string):unknown;
 encodeBit128FileRecord(binding:Document,logical:Document,identity:{module:string;element:string},values:Bit128RecordValue[]):unknown;
 decodeBit128FileRecord(binding:Document,logical:Document,identity:{module:string;element:string},datum:Record<string,Json>):unknown;
 projectBit128CarrierSchema(binding:Document,logical:Document,identity:{module:string;element:string},policy:Bit128ProjectionPolicy):unknown;
 recoverBit128CarrierProjection(report:Bit128NativeProjection,text:string):unknown;
 parseBits128(hex:string):Bit128Value;
 parseUuid(text:string):UuidValue;
 bits128FromBytes(bytes:Uint8Array):Bit128Value;
 bits128ToBytes(value:Bit128Value):Uint8Array;
 uuidFromBits128(value:Bit128Value):UuidValue;
 uuidToBits128(value:UuidValue):Bit128Value;
 compareBits128(left:Bit128Value,right:Bit128Value):-1|0|1;
 bits128ToWords(value:Bit128Value,signed:boolean):{high:string;low:string};
 bits128FromWords(words:{high:string;low:string},signed:boolean):Bit128Value;
 bits128ToInteger(value:Bit128Value,signed:boolean):{integerToken:string};
 bits128FromInteger(literal:{integerToken:string},signed:boolean):Bit128Value;
 classifyNativeType(input:Bit128NativeTypeInput):unknown;
}

type Bit128EngineErrorGuard=(error:unknown)=>boolean;

function rustCall<T>(operation: () => T,isBit128EngineError:Bit128EngineErrorGuard): T {
 try { return operation(); }
 catch (error) {
  if(!isBit128EngineError(error))throw error;
  const candidate = error as {name?: unknown; code?: unknown; message?: unknown; path?: unknown};
  if (candidate?.name === 'UmfCoreError' && typeof candidate.code === 'string' &&
   (candidate.code.startsWith('BIT128_') || candidate.code.startsWith('UUID_'))) {
   throw new UmfError(candidate.code, String(candidate.message ?? ''), typeof candidate.path === 'string' ? candidate.path : '');
  }
  throw error;
 }
}

/**
 * Bind the Rust codec to the public TypeScript value signatures. The Rust engine owns validation, identity, ordering, carrier and projection semantics;
 * this boundary preserves the existing public TypeScript result types and UMF errors.
 */
export function bindBit128Rust(engine: Bit128RustEngine,isBit128EngineError:Bit128EngineErrorGuard=()=>false) {
 const call = <T>(operation: () => T) => rustCall(operation,isBit128EngineError);
 return Object.freeze({
  inspectBit128Binding(binding:Document,logical:Document):Validation{return call(()=>engine.inspectBit128Binding(binding,logical)) as Validation;},
  encodeBit128CarrierValue(binding:Document,logical:Document,identity:{module:string;element:string},literal:CoreLiteral):Record<string,string|null>{return call(()=>engine.encodeBit128CarrierValue(binding,logical,identity,literal)) as Record<string,string|null>;},
  decodeBit128CarrierValue(binding:Document,logical:Document,identity:{module:string;element:string},slots:Record<string,string|null>):CoreLiteral{return call(()=>engine.decodeBit128CarrierValue(binding,logical,identity,slots)) as CoreLiteral;},
  encodeBit128Record(binding:Document,logical:Document,identity:{module:string;element:string},values:Bit128RecordValue[]):Record<string,string|null>{return call(()=>engine.encodeBit128Record(binding,logical,identity,values)) as Record<string,string|null>;},
  decodeBit128Record(binding:Document,logical:Document,identity:{module:string;element:string},slots:Record<string,string|null>):Bit128RecordValue[]{return call(()=>engine.decodeBit128Record(binding,logical,identity,slots)) as Bit128RecordValue[];},
  projectBit128Model(binding:Document,logical:Document,lossPolicy:'strict'|'report'):Bit128ModelProjection{return call(()=>engine.projectBit128Model(binding,logical,lossPolicy)) as Bit128ModelProjection;},
  recoverBit128ModelProjection(report:Bit128ModelProjection,text:string):{logical:Document;binding:Document}{return call(()=>engine.recoverBit128ModelProjection(report,text)) as {logical:Document;binding:Document};},
  encodeBit128FileRecord(binding:Document,logical:Document,identity:{module:string;element:string},values:Bit128RecordValue[]):Record<string,Json>{return call(()=>engine.encodeBit128FileRecord(binding,logical,identity,values)) as Record<string,Json>;},
  decodeBit128FileRecord(binding:Document,logical:Document,identity:{module:string;element:string},datum:Record<string,Json>):Bit128RecordValue[]{return call(()=>engine.decodeBit128FileRecord(binding,logical,identity,datum)) as Bit128RecordValue[];},
  projectBit128CarrierSchema(binding:Document,logical:Document,identity:{module:string;element:string},policy:Bit128ProjectionPolicy):Bit128NativeProjection{return call(()=>engine.projectBit128CarrierSchema(binding,logical,identity,policy)) as Bit128NativeProjection;},
  recoverBit128CarrierProjection(report:Bit128NativeProjection,text:string):{logical:Document;binding:Document}{return call(()=>engine.recoverBit128CarrierProjection(report,text)) as {logical:Document;binding:Document};},
  parseBits128(hex: string): Bit128Value { return call(() => engine.parseBits128(hex)); },
  parseUuid(text: string): UuidValue { return call(() => engine.parseUuid(text)); },
  bits128FromBytes(bytes: Uint8Array): Bit128Value { return call(() => engine.bits128FromBytes(bytes)); },
  bits128ToBytes(value: Bit128Value): Uint8Array { return call(() => engine.bits128ToBytes(value)); },
  uuidFromBits128(value: Bit128Value): UuidValue { return call(() => engine.uuidFromBits128(value)); },
  uuidToBits128(value: UuidValue): Bit128Value { return call(() => engine.uuidToBits128(value)); },
  compareBits128(left: Bit128Value, right: Bit128Value): -1 | 0 | 1 { return call(() => engine.compareBits128(left, right)); },
  bits128ToWords(value: Bit128Value, signed: boolean): {high: string; low: string} { return call(() => engine.bits128ToWords(value, signed)); },
  bits128FromWords(words: {high: string; low: string}, signed: boolean): Bit128Value { return call(() => engine.bits128FromWords(words, signed)); },
  bits128ToInteger(value: Bit128Value, signed: boolean): {integerToken: string} { return call(() => engine.bits128ToInteger(value, signed)); },
  bits128FromInteger(literal: {integerToken: string}, signed: boolean): Bit128Value { return call(() => engine.bits128FromInteger(literal, signed)); },
  classifyBit128NativeType(input:Bit128NativeTypeInput):{source:Bit128NativeTypeInput;scalarType?:'uuid'|'bits128';basis:'native-type-identity'|'unclassified'}{return call(()=>engine.classifyNativeType(input)) as {source:Bit128NativeTypeInput;scalarType?:'uuid'|'bits128';basis:'native-type-identity'|'unclassified'};},
 });
}
