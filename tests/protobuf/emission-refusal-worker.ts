// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {importProtobufDescriptorSet,exportProtobufSources,proposeProtobufDescriptorEdit,type DescriptorNode,type ProtobufSourceEmitter} from '../../src/index-node-v4';
const kind=Bun.argv[2];assert.ok(kind==='file'||kind==='set');
const emitter:ProtobufSourceEmitter={async emit(descriptorSet){
 const child=Bun.spawn(['go','run','.'],{cwd:'native/protobuf',stdin:new Blob([JSON.stringify({operation:'emit',descriptorHex:Buffer.from(descriptorSet).toString('hex')})]),stdout:'pipe',stderr:'pipe'});
 const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 assert.equal(exit,0,err);const result=JSON.parse(out);if(result.error)throw Error(result.error);return result;
}};
const source=importProtobufDescriptorSet(await Bun.file('fixtures/protobuf/authored.pb').bytes(),{id:'unknown'});
const changed=proposeProtobufDescriptorEdit(source,set=>{
 const target=kind==='file'?(set.fields.file as unknown as DescriptorNode[]).find(file=>file.fields.name==='legacy.proto')!:set;
 target.unknown.push({number:50001,wireType:0,data:'07'});
}).document;
await assert.rejects(exportProtobufSources(changed,emitter),kind==='file'?/changed descriptor semantics/:/Unknown descriptor-set/);
console.log(JSON.stringify({kind,refused:true}));
