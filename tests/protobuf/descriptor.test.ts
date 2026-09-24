import {test,expect,beforeAll} from 'bun:test';
import {importProtobufDescriptorSet,exportProtobufDescriptorSet,getProtobufDescriptorSet,inspectProtobuf,proposeProtobufDescriptorEdit,readDocument,writeDocument,readDescriptorSet,writeDescriptorSet,type DescriptorNode} from '../../src';
import {fromBinary,toBinary} from '@bufbuild/protobuf';
import {FileDescriptorSetSchema} from '@bufbuild/protobuf/wkt';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
beforeAll(async()=>{
 const version=Bun.spawn(['protoc','--version'],{stdout:'pipe'});
 expect((await new Response(version.stdout).text()).trim()).toBe('libprotoc 36.2');
 expect(await version.exited).toBe(0);
 const manifest=await Bun.file('fixtures/protobuf/upstream/manifest.json').json() as {sha256:Record<string,string>};
 for(const[name,digest]of Object.entries(manifest.sha256)){
  const data=await Bun.file('fixtures/protobuf/upstream/'+name).bytes();
  expect(new Bun.CryptoHasher('sha256').update(data).digest('hex')).toBe(digest);
 }
});
const fixture=await Bun.file('fixtures/protobuf/authored.pb').bytes();
const child=(node:DescriptorNode,name:string,index:number)=> (node.fields[name] as unknown as DescriptorNode[])[index]!;
test('US-003-AC1: descriptor presence, source metadata, options and exact defaults survive JSON/YAML',()=>{
 const doc=importProtobufDescriptorSet(fixture,{id:'authored'});
 const bytes=exportProtobufDescriptorSet(readDocument(writeDocument(doc,'yaml'),'yaml'));
 expect(fromBinary(FileDescriptorSetSchema,bytes)).toEqual(fromBinary(FileDescriptorSetSchema,fixture));
 expect(inspectProtobuf(doc).diagnostics.map(d=>d.code)).toContain('PROTOBUF_UNKNOWN');
 expect(inspectProtobuf(doc).complete).toBe(false);
 const set=getProtobufDescriptorSet(doc);
 const file=(set.fields.file as unknown as DescriptorNode[]).find(f=>f.fields.name==='legacy.proto')!;
 expect(child(child(file,'message_type',0),'field',1).fields.default_value).toBe('9223372036854775807');
 expect(file.fields.source_code_info).toBeDefined();
 file.fields.name='changed';expect(getProtobufDescriptorSet(doc)).not.toEqual(set);
});
test('US-003-AC2: typed candidate edit changes independent native compiler output',async()=>{
 const doc=importProtobufDescriptorSet(fixture,{id:'edit'});const snapshot=writeDocument(doc);
 const result=proposeProtobufDescriptorEdit(doc,set=>{
  const file=(set.fields.file as unknown as DescriptorNode[]).find(f=>f.fields.name==='legacy.proto')!;
  child(child(file,'message_type',0),'field',1).fields.default_value='17';
 });
 expect(writeDocument(doc)).toBe(snapshot);
 expect(result.diagnostics.map(d=>d.code)).toContain('PROTOBUF_COMPILER_REQUIRED');
 const directory=await mkdtemp(join(tmpdir(),'umf-protobuf-'));
 try{
  const edited=join(directory,'edited.pb');await Bun.write(edited,exportProtobufDescriptorSet(result.document));
  const compiled=join(directory,'compiled.pb');
  const proc=Bun.spawn(['protoc','--descriptor_set_in='+edited,'--descriptor_set_out='+compiled,'--include_imports','legacy.proto','modern.proto','edition.proto'],{stderr:'pipe'});
  const error=await new Response(proc.stderr).text();expect(await proc.exited,error).toBe(0);
  const set=fromBinary(FileDescriptorSetSchema,await Bun.file(compiled).bytes());
  expect(set.file.find(f=>f.name==='legacy.proto')!.messageType[0]!.field[1]!.defaultValue).toBe('17');
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('US-003-AC3: invalid values and unknown representation fields fail without source mutation',()=>{
 const doc=importProtobufDescriptorSet(fixture,{id:'invalid'});
 expect(()=>proposeProtobufDescriptorEdit(doc,set=>{child(set,'file',0).fields.name=3;})).toThrow();
 const set=getProtobufDescriptorSet(doc);(set as any).future='retain';
 expect(()=>writeDescriptorSet(set)).toThrow('Unknown representation');
 expect(()=>readDescriptorSet(new Uint8Array([0xff]))).toThrow();
 const empty=readDescriptorSet(new Uint8Array());empty.unknown.push({number:50000,wireType:0,data:''});
 expect(()=>writeDescriptorSet(empty)).toThrow();
});
test('US-003-AC1: unknown descriptor wire fields survive and explicit defaults retain presence',()=>{
 const set=fromBinary(FileDescriptorSetSchema,new Uint8Array());
 set.$unknown=[{no:50001,wireType:0,data:new Uint8Array([0x96,1])}];
 const bytes=toBinary(FileDescriptorSetSchema,set);
 expect(fromBinary(FileDescriptorSetSchema,writeDescriptorSet(readDescriptorSet(bytes)))).toEqual(set);
});

test('US-003-AC4: independent compiler decodes identical descriptors across authored and standard corpus',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-protobuf-corpus-'));
 try{
  const root='fixtures/protobuf/upstream';
  const files=Array.from(new Bun.Glob('google/protobuf/*.proto').scanSync(root)).sort();
  const input=join(directory,'source.pb');
  const compile=Bun.spawn(['protoc','-I',root,'-I','fixtures/protobuf','--include_imports','--include_source_info','--descriptor_set_out='+input,...files,'legacy.proto','modern.proto','edition.proto'],{stderr:'pipe'});
  const errors=await new Response(compile.stderr).text();expect(await compile.exited,errors).toBe(0);
  const original=await Bun.file(input).bytes();
  const doc=importProtobufDescriptorSet(original,{id:'native-corpus'});
  const output=exportProtobufDescriptorSet(readDocument(writeDocument(doc,'yaml'),'yaml'));
  async function decode(data:Uint8Array){
   const process=Bun.spawn(['protoc','-I',root,'--decode=google.protobuf.FileDescriptorSet','google/protobuf/descriptor.proto'],{stdin:new Blob([data as Uint8Array<ArrayBuffer>]),stdout:'pipe',stderr:'pipe'});
   const text=await new Response(process.stdout).text();const errors=await new Response(process.stderr).text();expect(await process.exited,errors).toBe(0);return text;
  }
  const before=await decode(original),after=await decode(output);
  expect(after).toBe(before);
  expect(before).toContain('proto3_optional: true');expect(before).toContain('edition: EDITION_2023');
  expect(before).toContain('default_value: "9223372036854775807"');expect(before).toContain('51001: "stable identifier"');
  expect(before).toContain('map_entry: true');expect(before).toContain('client_streaming: true');
  const descriptors=fromBinary(FileDescriptorSetSchema,output);
  await Bun.write('fixtures/protobuf/descriptor-results.json',JSON.stringify({compiler:'libprotoc 36.2',runtime:'@bufbuild/protobuf 2.15.0',files:descriptors.file.map(f=>f.name),nativeDescriptorTextEquality:true,sourceCodeInfoRetained:true,normalization:'Native protoc text decode; no descriptor fields stripped. Binary field ordering and duplicate singular wire occurrences are not lexical guarantees.',sourceLanguageAdapter:'not yet implemented'},null,2)+'\n');
 }finally{await rm(directory,{recursive:true,force:true});}
},20000);
