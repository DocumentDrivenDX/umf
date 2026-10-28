import {expect,test} from 'bun:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runDescriptorReaderCases,runFrozenOperations} from '../../scripts/rust-migration/r8/protobuf-descriptor-document-replay.mjs';

const rootEntry=process.env.UMF_PROTOBUF_V4_NODE_ENTRY;
if(!rootEntry)throw new Error('UMF_PROTOBUF_V4_NODE_ENTRY must name a freshly source-built V4 Node entry');
const root=await import(pathToFileURL(resolve(rootEntry)).href);
const reference=await import('../../src/index.ts');
const packet=JSON.parse(await Bun.file('docs/helix/04-build/evidence/rust-migration/r8-protobuf-descriptor-predecessor/predecessor.json').text());
const descriptorPacket=JSON.parse(await Bun.file('tests/rust-core/protobuf-read-descriptor-predecessor.json').text());

test('Node/Bun V4 default selects Rust for all seven pure descriptor/document operations',()=>{
  for(const name of packet.operations)expect(typeof root[name]).toBe('function');
  expect(typeof root.readDescriptorSetRustCandidate).toBe('function');
  expect(runFrozenOperations(root,packet).operationVectors).toBe(18);
  expect(runDescriptorReaderCases(root,descriptorPacket)).toBe(14);
  expect(runFrozenOperations(reference,packet).operationVectors).toBe(18);
  expect(runDescriptorReaderCases(reference,descriptorPacket)).toBe(14);
}, {timeout:120_000});

test('Node/Bun V4 root preserves public UmfError, getter order, unknown wire, and copies',()=>{
  let error;try{root.readDescriptorSet(new Uint8Array(11).fill(0x80));}catch(caught){error=caught;}
  expect(error).toBeInstanceOf(root.UmfError);
  expect(error.message).toBe(packet.vectors.readMalformed.message);
  const getterError=new Error('id getter observed'),options={};
  Object.defineProperty(options,'id',{enumerable:true,get(){throw getterError;}});
  let observed;try{root.importProtobufDescriptorSet(new Uint8Array(4_000_001),options);}catch(caught){observed=caught;}
  expect(observed).toBe(getterError);
  const unknown=Uint8Array.from([0x82,0xb5,0x18,4,0,1,2,0xff]);
  const document=root.importProtobufDescriptorSet(unknown,{id:'copy'}),tree=root.getProtobufDescriptorSet(document);
  tree.unknown[0].data='00';
  expect([...root.exportProtobufDescriptorSet(document)]).toEqual([...unknown]);
  const first=root.exportProtobufDescriptorSet(document);first[0]=0;
  expect([...root.exportProtobufDescriptorSet(document)]).toEqual([...unknown]);
});
