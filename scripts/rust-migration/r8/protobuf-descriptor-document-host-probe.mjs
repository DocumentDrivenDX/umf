// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {runDescriptorReaderCases,runFrozenOperations} from './protobuf-descriptor-document-replay.mjs';

const [defaultEntry,referenceEntry,predecessorPath,descriptorPath,addonPath]=process.argv.slice(2);
const predecessor=JSON.parse(await readFile(predecessorPath,'utf8'));
const descriptorPacket=JSON.parse(await readFile(descriptorPath,'utf8'));
const require=createRequire(import.meta.url);
const addon=require(addonPath);
assert.equal(typeof addon.executeProtobufDocumentWire,'function','native descriptor/document asset entry');
const original=addon.executeProtobufDocumentWire;let nativeCalls=0;
addon.executeProtobufDocumentWire=function(...args){nativeCalls++;return Reflect.apply(original,this,args);};
const root=await import(pathToFileURL(defaultEntry).href);const reference=await import(pathToFileURL(referenceEntry).href);
function route(api,label){
  const begin=nativeCalls;
  const operations=runFrozenOperations(api,predecessor);
  const descriptorReaderCases=runDescriptorReaderCases(api,descriptorPacket);
  const optionError=new Error('id getter observed'),options={};
  Object.defineProperty(options,'id',{enumerable:true,get(){throw optionError;}});
  let observed;try{api.importProtobufDescriptorSet(new Uint8Array(4_000_001),options);}catch(error){observed=error;}
  assert.equal(observed,optionError,`${label} preserves option getter order and identity`);
  const unknown=Uint8Array.from([0x82,0xb5,0x18,4,0,1,2,0xff]);
  const document=api.importProtobufDescriptorSet(unknown,{id:`copy-${label}`});
  const tree=api.getProtobufDescriptorSet(document);tree.unknown[0].data='00';
  const exported=api.exportProtobufDescriptorSet(document);assert.equal(Buffer.from(exported).toString('hex'),'82b51804000102ff');
  exported[0]=0;assert.equal(Buffer.from(api.exportProtobufDescriptorSet(document)).toString('hex'),'82b51804000102ff');
  const dispatches=nativeCalls-begin;
  return{...operations,descriptorReaderCases,optionGetterIdentity:true,copiedOutputs:true,nativeCalls:dispatches};
}
const referenceResult=route(reference,'reference');
assert.equal(referenceResult.nativeCalls,0,'reference package must remain TypeScript');
const defaultResult=route(root,'default');
assert(defaultResult.nativeCalls>0,'default package must use the Rust Node binding');
assert.deepEqual({...defaultResult,nativeCalls:0},{...referenceResult,nativeCalls:0},'root/reference behavior parity');
console.log(JSON.stringify({runtime:process.versions.bun?`Bun ${process.versions.bun}`:`Node ${process.version}`,default:defaultResult,reference:referenceResult}));
