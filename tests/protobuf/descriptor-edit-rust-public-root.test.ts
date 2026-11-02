// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {importProtobufDescriptorSet,exportProtobufDescriptorSet,proposeProtobufDescriptorEdit} from '../../src/index-node-v4';

test('R8 Protobuf descriptor edit is Rust-backed at the public Node root',()=>{
 const source=importProtobufDescriptorSet(new Uint8Array(),{id:'public-edit'});
 const original=exportProtobufDescriptorSet(source);
 const edited=proposeProtobufDescriptorEdit(source,set=>{
  set.unknown.push({number:50000,wireType:0,data:'07'});
 });
 expect(edited.document).not.toBe(source);
 expect(exportProtobufDescriptorSet(edited.document)).not.toEqual(original);
 expect(edited.diagnostics.map(item=>item.code)).toContain('PROTOBUF_COMPILER_REQUIRED');
 expect(exportProtobufDescriptorSet(source)).toEqual(original);
 expect(()=>proposeProtobufDescriptorEdit(source,set=>{
  set.unknown.push({number:50001,wireType:9 as never,data:'00'});
 })).toThrow();
 const recovered=proposeProtobufDescriptorEdit(source,set=>{
  set.unknown.push({number:50002,wireType:0,data:'09'});
 });
 expect(exportProtobufDescriptorSet(recovered.document)).not.toEqual(original);
 expect(exportProtobufDescriptorSet(source)).toEqual(original);
});
