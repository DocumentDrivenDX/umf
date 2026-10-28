// SPDX-License-Identifier: MIT OR Apache-2.0
export const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const canonical=value=>JSON.stringify(stable(value));
const bytes=hex=>Uint8Array.from(hex.match(/../g)??[],part=>parseInt(part,16));
const hex=value=>Array.from(value,byte=>byte.toString(16).padStart(2,'0')).join('');
const observed=(run,api)=>{
  try{return{status:'ok',value:run()};}
  catch(error){return{status:'error',name:error?.name??'Error',code:error?.code??null,path:error?.path??null,message:String(error?.message??error),publicUmfError:error instanceof api.UmfError};}
};

export function runFrozenOperations(api,packet){
  const authored=bytes(packet.bytes.authored),unknown=bytes(packet.bytes.unknownWire);
  const document=api.importProtobufDescriptorSet(authored,{id:'frozen-packet'});
  const unknownDocument=api.importProtobufDescriptorSet(unknown,{id:'unknown-wire'});
  const calls={
    readEmpty:()=>api.readDescriptorSet(new Uint8Array()),
    readAuthored:()=>api.readDescriptorSet(authored),
    readUnknownWire:()=>api.readDescriptorSet(unknown),
    readMalformed:()=>api.readDescriptorSet(bytes(packet.bytes.malformed)),
    readOverLimit:()=>api.readDescriptorSet(new Uint8Array(4_000_001)),
    writeAuthored:()=>hex(api.writeDescriptorSet(api.readDescriptorSet(authored))),
    writeUnknownWire:()=>hex(api.writeDescriptorSet(api.readDescriptorSet(unknown))),
    importAuthored:()=>api.importProtobufDescriptorSet(authored,{id:'frozen-packet'}),
    exportAuthored:()=>hex(api.exportProtobufDescriptorSet(document)),
    getAuthored:()=>api.getProtobufDescriptorSet(document),
    inspectAuthored:()=>api.inspectProtobuf(document),
    bundleAuthored:()=>{const bundle=api.exportProtobufBundle(document);return{...bundle,descriptorSet:hex(bundle.descriptorSet)};},
    exportMalformedDocument:()=>api.exportProtobufDescriptorSet({}),
    inspectMalformedDocument:()=>api.inspectProtobuf({}),
    exportUnknownWire:()=>hex(api.exportProtobufDescriptorSet(unknownDocument)),
    unknownWireTree:()=>api.getProtobufDescriptorSet(unknownDocument),
    writeInvalidUnknownWire:()=>api.writeDescriptorSet({type:'google.protobuf.FileDescriptorSet',fields:{},unknown:[{number:50000,wireType:2,data:'00'}]}),
    writeUnknownRepresentation:()=>api.writeDescriptorSet({type:'google.protobuf.FileDescriptorSet',fields:{},unknown:[],extra:true}),
  };
  const names=Object.keys(calls);
  if(names.length!==18)throw new Error(`expected 18 frozen operation vectors, got ${names.length}`);
  for(const name of names){
    const actual=observed(calls[name],api);
    if(canonical(actual)!==canonical(packet.vectors[name]))throw new Error(`${name} frozen result mismatch: ${canonical(actual)}`);
  }
  return {operationVectors:names.length,unknownWireHex:hex(api.exportProtobufDescriptorSet(unknownDocument))};
}

export function runDescriptorReaderCases(api,packet){
  const raw={
    empty:[], 'zero-tag':[0], 'truncated-tag-varint':[0x80], 'bad-wire-type':[0x0f],
    'truncated-fixed32':[0x0d,1], 'truncated-length':[0x0a,5,1], 'truncated-field-varint':[0x10,0x80],
    'malformed-10th-varint':[0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,2],
    'overlong-unknown-varint':[0xa0,6,0x80,0], 'true-trailing-tag':[0x0a,0,0x0f],
    'offset-valid-file':[0x99,0x0a,0,0x99], 'exact-limit-malformed-first-byte':new Array(4_000_000).fill(0),
    'limit-plus-one':new Array(4_000_001).fill(0), 'unknown-wire-preservation':[0x82,0xb5,0x18,4,0,1,2,0xff],
  };
  const names=Object.keys(packet.cases);
  if(names.length!==14)throw new Error(`expected 14 descriptor reader cases, got ${names.length}`);
  for(const name of names){
    if(!Object.hasOwn(raw,name))throw new Error(`missing descriptor reader input: ${name}`);
    let input=Uint8Array.from(raw[name]);if(name==='offset-valid-file')input=input.subarray(1,3);
    const actual=observed(()=>api.readDescriptorSet(input),api);
    const normalized=actual.status==='ok'?{ok:true,value:actual.value}:{ok:false,name:actual.name,code:actual.code,path:actual.path,message:actual.message};
    if(canonical(normalized)!==canonical(packet.cases[name]))throw new Error(`${name} descriptor reader result mismatch: ${canonical(normalized)}`);
  }
  return names.length;
}
