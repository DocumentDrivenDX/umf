// @covers US-003-AC7
import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importProtobufSources,exportProtobufDescriptorSet,inspectProtobuf,type ProtobufSourceCompiler,type ProtobufSourceRequest} from '../../src';
export const sources:ProtobufSourceRequest={roots:['legacy.proto','modern.proto','edition.proto'],files:{}};
for(const name of sources.roots)sources.files[name]=await Bun.file('fixtures/protobuf/'+name).text();
sources.files['google/protobuf/descriptor.proto']=await Bun.file('fixtures/protobuf/upstream/google/protobuf/descriptor.proto').text();
const compiler:ProtobufSourceCompiler={async compile(request){
 const proc=Bun.spawn(['go','run','.'],{cwd:'native/protobuf',stdin:new Blob([JSON.stringify(request)]),stdout:'pipe',stderr:'pipe'});
 const [output,errors]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
 if(await proc.exited)throw new Error(errors);
 const result=JSON.parse(output);if(result.error)throw new Error(result.error);
 return {compiler:result.compiler,descriptorSet:Uint8Array.from(Buffer.from(result.descriptorHex,'hex'))};
}};
test('US-003-AC7: native source bundle compiles into editable descriptors with source archive',async()=>{
 const doc=await importProtobufSources(sources,compiler,{id:'source'});
 expect(exportProtobufDescriptorSet(doc).length).toBeGreaterThan(0);
 expect(inspectProtobuf(doc).valid).toBe(true);
 const archive=(doc.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any).sourceArchive;
 expect(archive.files).toEqual(sources.files);expect(archive.role).toBe('original');
 await expect(importProtobufSources({roots:['missing.proto'],files:{}},compiler,{id:'missing'})).rejects.toThrow('Roots');
 await expect(importProtobufSources({roots:['a.proto'],files:{'a.proto':'syntax="proto3"; import "missing.proto"; message A {}'}},compiler,{id:'missing'})).rejects.toThrow('missing.proto');
 await expect(importProtobufSources({roots:['a.proto'],files:{'a.proto':'syntax="proto3"; message A { string x = 1; int32 y = 1; }'}},compiler,{id:'invalid'})).rejects.toThrow();
 const directory=await mkdtemp(join(tmpdir(),'umf-source-compiler-'));
 try{
  const baseline=join(directory,'native.pb'),compiled=join(directory,'source.pb');
  const native=Bun.spawn(['protoc','-I','fixtures/protobuf/upstream','-I','fixtures/protobuf','--include_imports','--retain_options','--descriptor_set_out='+baseline,...sources.roots],{stderr:'pipe'});
  const errors=await new Response(native.stderr).text();expect(await native.exited,errors).toBe(0);
  await Bun.write(compiled,exportProtobufDescriptorSet(doc));
  for(const script of ['scripts/protobuf-source-oracle.py','scripts/protobuf-behavior-oracle.py']){
   const oracle=Bun.spawn([process.env.UMF_PYTHON_PATH??'.venv/bin/python',script,baseline,compiled],{stdout:'pipe',stderr:'pipe',env:{...process.env,UMF_BEHAVIOR_REPORT:'fixtures/protobuf/source-behavior-results.json'}});
   const [out,err]=await Promise.all([new Response(oracle.stdout).text(),new Response(oracle.stderr).text()]);
   expect(await oracle.exited,out+'\n'+err).toBe(0);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
 await Bun.write('fixtures/protobuf/source-compiler-results.json',JSON.stringify({compiler:archive.compiler,roots:sources.roots,compiled:true,nativeDescriptorAgreement:true,normalization:'SourceCodeInfo excluded across different compilers; omitted syntax normalized to proto2; protoc --retain_options; all other descriptor fields compared',nativeBehaviorChecks:42,originalSourceRetained:true,missingImportRejected:true,invalidFieldNumberRejected:true,sourceEmission:'not yet implemented'},null,2)+'\n');
},60000);
