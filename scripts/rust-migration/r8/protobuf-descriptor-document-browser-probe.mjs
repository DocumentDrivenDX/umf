// SPDX-License-Identifier: MIT OR Apache-2.0
import {runDescriptorReaderCases,runFrozenOperations} from './protobuf-descriptor-document-replay.mjs';

try{
  const root=await import('@umf/core');
  const reference=await import('@umf/core/reference');
  const predecessor=await(await fetch('/packets/protobuf.json')).json();
  const descriptorPacket=await(await fetch('/packets/descriptor.json')).json();
  function route(api,label){
    const operations=runFrozenOperations(api,predecessor);
    const descriptorReaderCases=runDescriptorReaderCases(api,descriptorPacket);
    const optionError=new Error('id getter observed'),options={};
    Object.defineProperty(options,'id',{enumerable:true,get(){throw optionError;}});
    let observed;try{api.importProtobufDescriptorSet(new Uint8Array(4_000_001),options);}catch(error){observed=error;}
    if(observed!==optionError)throw new Error(`${label} did not preserve option getter identity/order`);
    let publicError;try{api.readDescriptorSet(new Uint8Array(11).fill(0x80));}catch(error){publicError=error;}
    if(!(publicError instanceof api.UmfError)||publicError.code!=='PROTOBUF_BINARY'||publicError.message!=='Error: invalid varint')throw new Error(`${label} did not preserve public UmfError identity and diagnostic`);
    const unknown=Uint8Array.from([0x82,0xb5,0x18,4,0,1,2,0xff]);
    const document=api.importProtobufDescriptorSet(unknown,{id:`copy-${label}`});
    const tree=api.getProtobufDescriptorSet(document);tree.unknown[0].data='00';
    const exported=api.exportProtobufDescriptorSet(document);
    if(Array.from(exported,byte=>byte.toString(16).padStart(2,'0')).join('')!=='82b51804000102ff')throw new Error(`${label} copy changed retained unknown bytes`);
    exported[0]=0;
    if(Array.from(api.exportProtobufDescriptorSet(document),byte=>byte.toString(16).padStart(2,'0')).join('')!=='82b51804000102ff')throw new Error(`${label} binary output is not isolated`);
    return{...operations,descriptorReaderCases,optionGetterIdentity:true,publicErrorIdentity:true,copiedOutputs:true};
  }
  const referenceResult=route(reference,'reference');
  const defaultResult=route(root,'default');
  const wasmInstantiateCount=window.__wasmInstantiateCount;
  const wasmAssetLoaded=performance.getEntriesByType('resource').some(entry=>entry.name.endsWith('.wasm'));
  if(!wasmAssetLoaded||wasmInstantiateCount===0)throw new Error('default package did not initialize its WASM asset');
  const scrub=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
  if(scrub(defaultResult)!==scrub(referenceResult))throw new Error('default/reference operation results differ');
  if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node global leaked into browser route');
  window.result={default:defaultResult,reference:referenceResult,wasmInstantiateCount,wasmAssetLoaded,nodeGlobalsAbsent:true};
}catch(error){window.failure=String(error?.stack??error);}
