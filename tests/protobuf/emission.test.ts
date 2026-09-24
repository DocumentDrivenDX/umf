// @covers US-003-AC8
import {test,expect} from 'bun:test';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {importProtobufDescriptorSet,exportProtobufDescriptorSet,exportProtobufSources,proposeProtobufDescriptorEdit,type DescriptorNode,type ProtobufSourceEmitter} from '../../src';
const emitter:ProtobufSourceEmitter={async emit(descriptorSet){
 const proc=Bun.spawn(['go','run','.'],{cwd:'native/protobuf',stdin:new Blob([JSON.stringify({operation:'emit',descriptorHex:Buffer.from(descriptorSet).toString('hex')})]),stdout:'pipe',stderr:'pipe'});
 const [out,err]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
 if(await proc.exited)throw new Error(err);const result=JSON.parse(out);if(result.error)throw new Error(result.error);return result;
}};

test('US-003-AC8: native source emission recompiles without semantic loss and reflects edits',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-emission-'));
 try{
  const baseline=join(directory,'original.pb');
  const native=Bun.spawn(['protoc','-I','fixtures/protobuf/upstream','-I','fixtures/protobuf','--include_imports','--retain_options','--include_source_info','--descriptor_set_out='+baseline,'legacy.proto','modern.proto','edition.proto'],{stderr:'pipe'});
  const errors=await new Response(native.stderr).text();expect(await native.exited,errors).toBe(0);
  const doc=importProtobufDescriptorSet(await Bun.file(baseline).bytes(),{id:'emit'});
  for(const edited of [false,true]){
   const current=edited?proposeProtobufDescriptorEdit(doc,set=>{
    const file=(set.fields.file as unknown as DescriptorNode[]).find(f=>f.fields.name==='legacy.proto')!;
    const message=(file.fields.message_type as unknown as DescriptorNode[])[0]!;
    (message.fields.field as unknown as DescriptorNode[])[1]!.fields.default_value='17';
   }).document:doc;
   const result=await exportProtobufSources(current,emitter);
   expect(result.source).toEqual(current);expect(result.diagnostics.some(d=>d.code==='PROTOBUF_SOURCE_LAYOUT')).toBe(true);
   const target=join(directory,edited?'edited':'unchanged');await mkdir(target);
   for(const[name,text]of Object.entries(result.files)){const path=join(target,name);await mkdir(dirname(path),{recursive:true});await Bun.write(path,text);}
   const output=join(target,'compiled.pb');
   const compiler=Bun.spawn(['protoc','-I',target,'--include_imports','--retain_options','--descriptor_set_out='+output,'legacy.proto','modern.proto','edition.proto'],{stderr:'pipe'});
   const stderr=await new Response(compiler.stderr).text();expect(await compiler.exited,stderr).toBe(0);
   const expected=join(target,'expected.pb');await Bun.write(expected,exportProtobufDescriptorSet(current));
   for(const script of edited?['scripts/protobuf-source-oracle.py']:['scripts/protobuf-source-oracle.py','scripts/protobuf-behavior-oracle.py']){
    const oracle=Bun.spawn([process.env.UMF_PYTHON_PATH??'.venv/bin/python',script,expected,output],{stdout:'pipe',stderr:'pipe',env:{...process.env,UMF_BEHAVIOR_REPORT:'fixtures/protobuf/emission-behavior-results.json'}});
    const [out,err]=await Promise.all([new Response(oracle.stdout).text(),new Response(oracle.stderr).text()]);expect(await oracle.exited,out+'\n'+err).toBe(0);
   }
   if(edited)expect(result.files['legacy.proto']).toContain('default = 17');
  }
  await Bun.write('fixtures/protobuf/emission-results.json',JSON.stringify({printer:'protoprint 1.18.1',compiler:'protocompile 0.14.1',oracle:'protoc 36.2; Python protobuf 7.36.2',roots:['legacy.proto','modern.proto','edition.proto'],unchangedNativeDescriptorEquality:true,editedNativeDescriptorEquality:true,behaviorChecks:42,normalization:'SourceCodeInfo excluded; omitted syntax normalized to proto2; every other descriptor field compared'},null,2)+'\n');
 }finally{await rm(directory,{recursive:true,force:true});}
},60000);

test('US-003-AC8: source emission refuses unknown semantics with no source representation',async()=>{
 const doc=importProtobufDescriptorSet(await Bun.file('fixtures/protobuf/authored.pb').bytes(),{id:'unknown'});
 const changed=proposeProtobufDescriptorEdit(doc,set=>{(set.fields.file as unknown as DescriptorNode[]).find(f=>f.fields.name==='legacy.proto')!.unknown.push({number:50001,wireType:0,data:'07'});}).document;
 await expect(exportProtobufSources(changed,emitter)).rejects.toThrow('changed descriptor semantics');
 const opaque=proposeProtobufDescriptorEdit(doc,set=>{set.unknown.push({number:50001,wireType:0,data:'07'});}).document;
 await expect(exportProtobufSources(opaque,emitter)).rejects.toThrow('Unknown descriptor-set');
},20000);

test('US-003-AC8: standard corpus emission reports each native root and unsupported Editions',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-emission-corpus-'));
 const roots=Array.from(new Bun.Glob('google/protobuf/*.proto').scanSync('fixtures/protobuf/upstream')).sort();
 const records:{root:string;outcome:string;detail?:string}[]=[];
 try{
  for(const[rootIndex,root]of roots.entries()){
   const baseline=join(directory,rootIndex+'.pb');
   const compiler=Bun.spawn(['protoc','-I','fixtures/protobuf/upstream','--include_imports','--retain_options','--descriptor_set_out='+baseline,root],{stderr:'pipe'});
   const error=await new Response(compiler.stderr).text();expect(await compiler.exited,error).toBe(0);
   const doc=importProtobufDescriptorSet(await Bun.file(baseline).bytes(),{id:root});
   const source=await Bun.file('fixtures/protobuf/upstream/'+root).text();
   if(source.includes('edition = "2024"')){
    let detail='';try{await exportProtobufSources(doc,emitter);}catch(error){detail=String(error);}
    expect(detail).toContain('2024');
    records.push({root,outcome:'unsupported',detail});continue;
   }
   const result=await exportProtobufSources(doc,emitter);
   const target=join(directory,'files'+rootIndex);await mkdir(target);
   for(const[name,text]of Object.entries(result.files)){const path=join(target,name);await mkdir(dirname(path),{recursive:true});await Bun.write(path,text);}
   const emitted=join(target,'recompiled.pb');
   const native=Bun.spawn(['protoc','-I',target,'--include_imports','--retain_options','--descriptor_set_out='+emitted,root],{stderr:'pipe'});
   const errors=await new Response(native.stderr).text();expect(await native.exited,errors).toBe(0);
   const oracle=Bun.spawn([process.env.UMF_PYTHON_PATH??'.venv/bin/python','scripts/protobuf-source-oracle.py',baseline,emitted],{stdout:'pipe',stderr:'pipe'});
   const [out,err]=await Promise.all([new Response(oracle.stdout).text(),new Response(oracle.stderr).text()]);expect(await oracle.exited,out+'\n'+err).toBe(0);
   records.push({root,outcome:'passed'});
  }
  await Bun.write('fixtures/protobuf/emission-corpus-results.json',JSON.stringify({printer:'protoprint 1.18.1',compiler:'protocompile 0.14.1',nativeOracle:'protoc 36.2',records},null,2)+'\n');
 }finally{await rm(directory,{recursive:true,force:true});}
},60000);
