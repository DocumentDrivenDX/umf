// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {UmfError,type Document} from '../../src/model/types';
import {bindParquetCaptureRust,type ParquetCaptureRustEngine} from '../../src/adapters/parquet/rust-capture-default';

const checkedContainers={source:{id:'copy'},status:'checked',complete:false,diagnostics:[],containers:[]} as any;
function stub(overrides:Record<string,unknown>={}) {
 const calls:string[]=[];
 const engine={
  profile:'test-profile',capabilities:{profile:'test-profile',maxBytes:1_000_000,exactSource:true,complete:false},
  captureParquet:()=>{calls.push('capture');return {captured:true};},
  importParquetSchema:()=>{calls.push('importSchema');return {imported:true};},
  encodeParquetWire:()=>{calls.push('encodeWire');return new Uint8Array([1,2]);},
  exportParquetCapture:()=>{calls.push('export');return new Uint8Array([3,4]);},
  inspectParquetFraming:()=>{calls.push('inspectFraming');return {status:'invalid'};},
  decodeParquetFooter:()=>{calls.push('decodeFooter');return {status:'blocked'};},
  inspectParquetMetadata:()=>{calls.push('inspectMetadata');return {status:'blocked'};},
  inspectParquetSchema:()=>{calls.push('inspectSchema');return {status:'blocked'};},
  inspectParquetPages:()=>{calls.push('inspectPages');return {status:'blocked'};},
  decodeParquetPageBodies:()=>{calls.push('decodePageBodies');return {status:'blocked'};},
  decodeParquetLevels:()=>{calls.push('decodeLevels');return {status:'blocked'};},
  decodeParquetPhysical:()=>{calls.push('decodePhysical');return {status:'blocked'};},
  decodeParquetValues:()=>{calls.push('decodeValues');return {status:'blocked'};},
  assembleParquetRows:()=>{calls.push('assembleRows');return {status:'blocked'};},
  repairParquetDictionaryOffsets:()=>{calls.push('repairDictionaryOffsets');return {status:'blocked'};},
  inspectParquetLogicalTypes:()=>{calls.push('inspectLogicalTypes');return {status:'blocked'};},
  inspectParquetContainers:()=>{calls.push('inspectContainers');return checkedContainers;},
  getParquetFieldMetadata:()=>{calls.push('getFieldMetadata');return {status:'blocked'};},
  appendParquetKeyValueMetadata:()=>{calls.push('appendKeyValueMetadata');return {status:'blocked'};},
  renameParquetField:()=>{calls.push('renameField');return {status:'blocked'};},
  ...overrides,
 } as unknown as ParquetCaptureRustEngine;
 return {engine,calls};
}

test('Parquet Rust facade forwards capture and result operations and returns public Rust errors',()=>{
 const {engine,calls}=stub(),api=bindParquetCaptureRust(engine);
 const document={umf:'0.10.0'} as Document;
 expect(api.captureParquet(new Uint8Array([1]),{id:'x'})).toEqual({captured:true});
 expect(api.importParquetSchema(new Uint8Array([1]),{id:'x'})).toEqual({imported:true});
 expect(api.encodeParquetWire({kind:'struct',fields:[]} as any)).toEqual(new Uint8Array([1,2]));
 expect(api.exportParquetCapture(document)).toEqual(new Uint8Array([3,4]));
 expect(api.decodeParquetValues(document)).toEqual({status:'blocked'});
 expect(calls).toEqual(['capture','importSchema','encodeWire','export','decodeValues']);

 const failure=Object.assign(new Error('capture failed'),{name:'UmfCoreError',code:'PARQUET_CAPTURE',path:'/source'});
 const throwing=stub({captureParquet:()=>{throw failure;}}).engine;
 expect(()=>bindParquetCaptureRust(throwing,e=>e===failure).captureParquet(new Uint8Array(),{id:'x'})).toThrow(UmfError);
});

test('Parquet default facade leaves malformed rename staging to the engine host boundary',()=>{
 const {engine,calls}=stub(),api=bindParquetCaptureRust(engine),document={} as Document;
 api.renameParquetField(document,1.5 as number,'field');
 api.renameParquetField(document,1,undefined as unknown as string);
 expect(calls).toEqual(['renameField','renameField']);
});
