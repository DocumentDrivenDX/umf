// @covers US-003-AC6
import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importProtobufDescriptorSet,exportProtobufDescriptorSet,proposeProtobufDescriptorEdit,writeDocument,readDocument,type DescriptorNode} from '../../src';

test('US-003-AC6: independent native runtime behavior survives and detects semantic mutations',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-protobuf-behavior-'));
 try{
  const original=join(directory,'original.pb'),emitted=join(directory,'emitted.pb');
  const compiler=Bun.spawn(['protoc','-I','fixtures/protobuf/upstream','-I','fixtures/protobuf','--include_imports','--descriptor_set_out='+original,'legacy.proto','modern.proto','edition.proto'],{stderr:'pipe'});
  const errors=await new Response(compiler.stderr).text();expect(await compiler.exited,errors).toBe(0);
  const doc=importProtobufDescriptorSet(await Bun.file(original).bytes(),{id:'behavior'});
  await Bun.write(emitted,exportProtobufDescriptorSet(readDocument(writeDocument(doc,'yaml'),'yaml')));
  const paths:string[]=[];
  for(const mutation of ['default','presence'] as const){
   const changed=proposeProtobufDescriptorEdit(doc,set=>{
    const files=set.fields.file as unknown as DescriptorNode[];
    const file=files.find(f=>f.fields.name===(mutation==='default'?'legacy.proto':'modern.proto'))!;
    const message=(file.fields.message_type as unknown as DescriptorNode[])[0]!;
    const field=(message.fields.field as unknown as DescriptorNode[])[1]!;
    if(mutation==='default')field.fields.default_value='17';
    else{
     const index=field.fields.oneof_index as number;
     delete field.fields.oneof_index;delete field.fields.proto3_optional;
     (message.fields.oneof_decl as unknown as DescriptorNode[]).splice(index,1);
    }
   });
   const path=join(directory,mutation+'.pb');await Bun.write(path,exportProtobufDescriptorSet(changed.document));paths.push(path);
  }
  const process=Bun.spawn([globalThis.process.env.UMF_PYTHON_PATH??'.venv/bin/python','scripts/protobuf-behavior-oracle.py',original,emitted,...paths],{stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text()]);
  expect(await process.exited,stdout+'\n'+stderr).toBe(0);
 }finally{await rm(directory,{recursive:true,force:true});}
},20000);
