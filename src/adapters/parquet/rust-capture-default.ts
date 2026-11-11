// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../../model/types';
import type {ParquetWireValue,ParquetFooterDecode} from './footer';
import type {ParquetFraming} from './index';
import type {ParquetMetadataInspection} from './metadata';
import type {ParquetSchemaInspection} from './schema';
import type {ParquetPageInspection} from './pages';
import type {ParquetPageBodies} from './bodies';
import type {ParquetLevels} from './levels';
import type {ParquetPhysical} from './physical';
import type {ParquetValues} from './values';
import type {ParquetRows} from './rows';
import type {ParquetOffsetRepair} from './repair-offsets';
import type {ParquetLogicalInspection} from './logical';
import type {ParquetContainerInspection} from './containers';
import type {ParquetFieldMetadataResult} from './field-metadata';
import type {ParquetKeyValue,ParquetMetadataTransform} from './transform';
import type {ParquetRenameResult} from './rename';
import type {captureParquet,exportParquetCapture,inspectParquetFraming} from './index';
import type {importParquetSchema} from './field-metadata';
import type {encodeParquetWire} from './encode';
import type {decodeParquetFooter} from './footer';
import type {inspectParquetMetadata} from './metadata';
import type {inspectParquetSchema} from './schema';
import type {inspectParquetPages} from './pages';
import type {decodeParquetPageBodies} from './bodies';
import type {decodeParquetLevels} from './levels';
import type {decodeParquetPhysical} from './physical';
import type {decodeParquetValues} from './values';
import type {assembleParquetRows} from './rows';
import type {repairParquetDictionaryOffsets} from './repair-offsets';
import type {inspectParquetLogicalTypes} from './logical';
import type {inspectParquetContainers} from './containers';
import type {getParquetFieldMetadata} from './field-metadata';
import type {appendParquetKeyValueMetadata} from './transform';
import type {renameParquetField} from './rename';
import type {ParquetArrowSchema,ParquetArrowRenamePolicy,ParquetArrowRenameResult} from './arrow-types';
import type {ArrowFlatbufferEncodingBackend} from '../arrow/api-types';

type ErrorGuard=(error:unknown)=>boolean;

/** Public shape supplied by the generated Node/WASM Rust binding. */
export interface ParquetCaptureRustEngine {
 readonly profile:string;
 readonly capabilities:Readonly<{profile:string;maxBytes:1_000_000;exactSource:true;complete:false}>;
 captureParquet(bytes:Uint8Array,options:{id:string}):unknown;
 importParquetSchema(bytes:Uint8Array,options:{id:string}):unknown;
 encodeParquetWire(value:unknown):Uint8Array;
 exportParquetCapture(document:unknown):Uint8Array;
 inspectParquetFraming(document:unknown):unknown;
 decodeParquetFooter(document:unknown):unknown;
 inspectParquetMetadata(document:unknown):unknown;
 getParquetArrowSchema(document:unknown):unknown;
 renameParquetFieldWithArrowSchema(document:unknown,policy:unknown):unknown;
 prepareRenameParquetFieldWithArrowSchema(document:unknown,policy:unknown):unknown;
 completeRenameParquetFieldWithArrowSchema(document:unknown,policy:unknown,flatbufferHex:string,backendError?:string):unknown;
 inspectParquetSchema(document:unknown):unknown;
 inspectParquetPages(document:unknown):unknown;
 decodeParquetPageBodies(document:unknown):unknown;
 decodeParquetLevels(document:unknown):unknown;
 decodeParquetPhysical(document:unknown):unknown;
 decodeParquetValues(document:unknown):unknown;
 assembleParquetRows(document:unknown):unknown;
 repairParquetDictionaryOffsets(document:unknown):unknown;
 inspectParquetLogicalTypes(document:unknown):unknown;
 inspectParquetContainers(document:unknown):unknown;
 getParquetFieldMetadata(document:unknown):unknown;
 appendParquetKeyValueMetadata(document:unknown,entries:unknown[]):unknown;
 renameParquetField(document:unknown,index:number,name:string):unknown;
}

function publicError(error:unknown,isNativeError:ErrorGuard,isBindingError:ErrorGuard):never {
 const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown}|null;
 if(isNativeError(error)&&candidate?.name==='UmfCoreError'&&typeof candidate.code==='string'&&(candidate.code.startsWith('PARQUET_')||candidate.code==='REQUEST'||candidate.code==='JSON_SCHEMA_SYNTAX'))
  throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
 if(isBindingError(error)&&candidate?.name==='UmfError'&&typeof candidate.code==='string')
  throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
 throw error;
}

/** Bind Rust's bounded Parquet capture/data operations to the V4 public error and result types. */
export function bindParquetCaptureRust(
 engine:ParquetCaptureRustEngine,
 isNativeUmfCoreError:ErrorGuard=()=>false,
 isBindingUmfError:ErrorGuard=()=>false,
) {
 const call=<T>(operation:()=>T):T=>{
  try{return operation();}
  catch(error){return publicError(error,isNativeUmfCoreError,isBindingUmfError);}
 };
 return Object.freeze({
  profile:engine.profile,
  capabilities:engine.capabilities,
  captureParquet(bytes:Uint8Array,options:{id:string}):ReturnType<typeof captureParquet>{return call(()=>engine.captureParquet(bytes,options)) as ReturnType<typeof captureParquet>;},
  importParquetSchema(bytes:Uint8Array,options:{id:string}):ReturnType<typeof importParquetSchema>{return call(()=>engine.importParquetSchema(bytes,options)) as ReturnType<typeof importParquetSchema>;},
  encodeParquetWire(value:ParquetWireValue):ReturnType<typeof encodeParquetWire>{return call(()=>engine.encodeParquetWire(value)) as ReturnType<typeof encodeParquetWire>;},
  exportParquetCapture(document:Document):ReturnType<typeof exportParquetCapture>{return call(()=>engine.exportParquetCapture(document)) as ReturnType<typeof exportParquetCapture>;},
  inspectParquetFraming(document:Document):ReturnType<typeof inspectParquetFraming>{return call(()=>engine.inspectParquetFraming(document)) as ParquetFraming;},
  decodeParquetFooter(document:Document):ReturnType<typeof decodeParquetFooter>{return call(()=>engine.decodeParquetFooter(document)) as ParquetFooterDecode;},
  inspectParquetMetadata(document:Document):ReturnType<typeof inspectParquetMetadata>{return call(()=>engine.inspectParquetMetadata(document)) as ParquetMetadataInspection;},
  getParquetArrowSchema(document:Document):ParquetArrowSchema{return call(()=>engine.getParquetArrowSchema(document)) as ParquetArrowSchema;},
  renameParquetFieldWithArrowSchema(document:Document,policy:ParquetArrowRenamePolicy,backend?:ArrowFlatbufferEncodingBackend):ParquetArrowRenameResult{
   if(backend===undefined)return call(()=>engine.renameParquetFieldWithArrowSchema(document,policy)) as ParquetArrowRenameResult;
   const prepared=call(()=>engine.prepareRenameParquetFieldWithArrowSchema(document,policy)) as ParquetArrowRenameResult & {schemaModel?:unknown};
   if(typeof prepared.schemaModel!=='string')return prepared as ParquetArrowRenameResult;
   let bytes:Uint8Array;
   try{
    if(backend?.identity!=='flatbuffers@25.9.23'||typeof backend.encode!=='function')throw new UmfError('ARROW_BACKEND','Expected explicit pinned FlatBuffers backend');
    const model=JSON.parse(prepared.schemaModel);
    bytes=backend.encode(model);
    if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.byteLength>1_000_000)throw new UmfError('ARROW_FLATBUFFER_BYTES','Expected bounded metadata bytes');
   }catch(error){
    const code=(error as {code?:unknown}|null)?.code;
    if(typeof code==='string'&&new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','DEADLINE','DEADLINE_EXCEEDED','WORK_LIMIT','CONTROL','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED']).has(code))throw error;
    const message=error instanceof Error?error.message:String(error);
    return call(()=>engine.completeRenameParquetFieldWithArrowSchema(document,policy,'',message)) as ParquetArrowRenameResult;
   }
   let flatbufferHex='';for(const byte of bytes)flatbufferHex+=byte.toString(16).padStart(2,'0');
   return call(()=>engine.completeRenameParquetFieldWithArrowSchema(document,policy,flatbufferHex)) as ParquetArrowRenameResult;
  },
  inspectParquetSchema(document:Document):ReturnType<typeof inspectParquetSchema>{return call(()=>engine.inspectParquetSchema(document)) as ParquetSchemaInspection;},
  inspectParquetPages(document:Document):ReturnType<typeof inspectParquetPages>{return call(()=>engine.inspectParquetPages(document)) as ParquetPageInspection;},
  decodeParquetPageBodies(document:Document):ReturnType<typeof decodeParquetPageBodies>{return call(()=>engine.decodeParquetPageBodies(document)) as ParquetPageBodies;},
  decodeParquetLevels(document:Document):ReturnType<typeof decodeParquetLevels>{return call(()=>engine.decodeParquetLevels(document)) as ParquetLevels;},
  decodeParquetPhysical(document:Document):ReturnType<typeof decodeParquetPhysical>{return call(()=>engine.decodeParquetPhysical(document)) as ParquetPhysical;},
  decodeParquetValues(document:Document):ReturnType<typeof decodeParquetValues>{return call(()=>engine.decodeParquetValues(document)) as ParquetValues;},
  assembleParquetRows(document:Document):ReturnType<typeof assembleParquetRows>{return call(()=>engine.assembleParquetRows(document)) as ParquetRows;},
  repairParquetDictionaryOffsets(document:Document):ReturnType<typeof repairParquetDictionaryOffsets>{return call(()=>engine.repairParquetDictionaryOffsets(document)) as ParquetOffsetRepair;},
  inspectParquetLogicalTypes(document:Document):ReturnType<typeof inspectParquetLogicalTypes>{return call(()=>engine.inspectParquetLogicalTypes(document)) as ParquetLogicalInspection;},
  inspectParquetContainers(document:Document):ReturnType<typeof inspectParquetContainers>{return call(()=>engine.inspectParquetContainers(document)) as ParquetContainerInspection;},
  getParquetFieldMetadata(document:Document):ReturnType<typeof getParquetFieldMetadata>{return call(()=>engine.getParquetFieldMetadata(document)) as ParquetFieldMetadataResult;},
  appendParquetKeyValueMetadata(document:Document,entries:ParquetKeyValue[]):ReturnType<typeof appendParquetKeyValueMetadata>{return call(()=>engine.appendParquetKeyValueMetadata(document,entries)) as ParquetMetadataTransform;},
  renameParquetField(document:Document,index:number,name:string):ReturnType<typeof renameParquetField>{return call(()=>engine.renameParquetField(document,index,name)) as ParquetRenameResult;},
 });
}
