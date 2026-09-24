// @covers US-004-AC1 US-004-AC2 US-004-AC3 US-004-AC4
import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {projectJsonSchemaToProtobuf,importJsonSchema,exportJsonSchema,importProtobufDescriptorSet,exportProtobufDescriptorSet,coreSchema,type ProtobufProjectionOptions,type ProtobufSourceCompiler} from '../../src';
import reportSchema from '../../spec/projections/json-schema-protobuf.schema.json';
import order from '../../fixtures/json-schema/order.schema.json';
import constraints from '../../fixtures/projections/constraints.schema.json';
const compiler:ProtobufSourceCompiler={async compile(request){
 const process=Bun.spawn(['go','run','.'],{cwd:'native/protobuf',stdin:new Blob([JSON.stringify(request)]),stdout:'pipe',stderr:'pipe'});
 const [out,err]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text()]);if(await process.exited)throw new Error(err);const result=JSON.parse(out);if(result.error)throw new Error(result.error);
 return {compiler:result.compiler,descriptorSet:Uint8Array.from(Buffer.from(result.descriptorHex,'hex'))};
}};
const options:ProtobufProjectionOptions={id:'projected',packageName:'umf.projection',messageName:'Record',integerType:'int64',lossPolicy:'allow-reported-loss',fields:Object.fromEntries(['id','count','note','tags','choice','ratio'].map((name,index)=>['/properties/'+name,{number:index+1}]))};
const schemaDocument=(value:unknown)=>importJsonSchema(JSON.stringify(value),{id:'source',baseUri:'https://example.test/source'});
const validateReport=new Ajv2020({strict:false}).addSchema(coreSchema).compile(reportSchema);

test('US-004-AC1: explicit mapping reports every unsupported constraint and retains exact source',async()=>{
 const source=schemaDocument(constraints);const result=await projectJsonSchemaToProtobuf(source,options,compiler);
 expect(result.status).toBe('projected');expect(validateReport(result)).toBe(true);
 expect(result.source).toEqual(source);expect(result.source).not.toBe(source);
 expect(JSON.parse(exportJsonSchema(result.source))).toEqual(constraints);
 for(const code of ['INTEGER_DOMAIN','PROTOJSON_INTEGER','NUMBER_DOMAIN','NULLABILITY_LOST','REQUIRED_NOT_ENFORCED','ARRAY_PRESENCE','OBJECT_OPENNESS','ANNOTATION_RETAINED'])expect(result.issues.some(issue=>issue.code===code),code).toBe(true);
 for(const path of ['/properties/id/minLength','/properties/count/minimum','/properties/tags/uniqueItems','/properties/tags/minItems','/properties/choice/oneOf'])expect(result.issues.some(issue=>issue.path===path),path).toBe(true);
 const targetOnly=importProtobufDescriptorSet(exportProtobufDescriptorSet(result.target!),{id:'target-only'});
 expect(targetOnly.vocabularies['umf.json-schema']).toBeUndefined();
 expect(()=>exportJsonSchema(targetOnly)).toThrow();
 expect(result.targetDiagnostics!.some(d=>d.code==='PROTOBUF_COMPILER_REQUIRED')).toBe(true);
 await Bun.write('fixtures/projections/constraints-result.json',JSON.stringify(result,null,2)+'\n');
});

test('US-004-AC2: strict policy, missing/conflicting bindings and ambiguous shapes block explicitly',async()=>{
 const strict=await projectJsonSchemaToProtobuf(schemaDocument(constraints),{...options,lossPolicy:'strict'},compiler);
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(validateReport(strict)).toBe(true);
 for(const fields of [{},{...options.fields,'/properties/count':{number:1}},{...options.fields,'/properties/count':{number:19000}},{...options.fields,'/no-field':{number:8}}]){
  const result=await projectJsonSchemaToProtobuf(schemaDocument(constraints),{...options,fields},compiler);expect(result.status).toBe('blocked');
 }
 for(const type of [['string','integer'],'null']){
  const result=await projectJsonSchemaToProtobuf(schemaDocument({type:'object',properties:{value:{type}}}),{...options,fields:{'/properties/value':{number:1}}},compiler);
  expect(result.status).toBe('blocked');expect(result.issues.some(i=>i.code==='TYPE_UNSUPPORTED')).toBe(true);
 }
});

test('US-004-AC3: nested referenced objects compile without merging native identity',async()=>{
 const fields=Object.fromEntries(['/properties/id','/properties/amount','/properties/lines','/$defs/Line/properties/sku','/$defs/Line/properties/quantity'].map((path,index)=>[path,{number:index+1}]));
 const result=await projectJsonSchemaToProtobuf(schemaDocument(order),{...options,fields},compiler);
 expect(result.status).toBe('projected');expect(result.mappings.length).toBe(5);expect(result.nativeSource).toContain('repeated Nested_1');
 expect(result.issues.some(i=>i.code==='REFERENCE_LOWERED')).toBe(true);
 const recursive=schemaDocument({type:'object',properties:{next:{$ref:'#/$defs/Node'}},$defs:{Node:{type:'object',properties:{next:{$ref:'#/$defs/Node'}}}}});
 const cycle=await projectJsonSchemaToProtobuf(recursive,{...options,fields:{'/properties/next':{number:1},'/$defs/Node/properties/next':{number:1}}},compiler);
 expect(cycle.status).toBe('projected');
});

test('US-004-AC4: independent target compiler/runtime demonstrates reported source-to-target mismatches',async()=>{
 const result=await projectJsonSchemaToProtobuf(schemaDocument(constraints),options,compiler);
 const directory=await mkdtemp(join(tmpdir(),'umf-projection-'));
 try{
  await Bun.write(join(directory,'projection.proto'),result.nativeSource!);
  const binary=join(directory,'projection.pb');
  const native=Bun.spawn(['protoc','-I',directory,'--descriptor_set_out='+binary,'projection.proto'],{stderr:'pipe'});
  const stderr=await new Response(native.stderr).text();expect(await native.exited,stderr).toBe(0);
  const report=join(directory,'report.json');await Bun.write(report,JSON.stringify(result));
  const oracle=Bun.spawn([process.env.UMF_PYTHON_PATH??'.venv/bin/python','scripts/projection-oracle.py',binary,report],{stdout:'pipe',stderr:'pipe'});
  const [out,err]=await Promise.all([new Response(oracle.stdout).text(),new Response(oracle.stderr).text()]);expect(await oracle.exited,out+'\n'+err).toBe(0);
  await Bun.write(report,JSON.stringify({...result,issues:result.issues.filter(i=>i.code!=='REQUIRED_NOT_ENFORCED')}));
  const mutant=Bun.spawn([process.env.UMF_PYTHON_PATH??'.venv/bin/python','scripts/projection-oracle.py',binary,report],{stdout:'pipe',stderr:'pipe'});
  await Promise.all([new Response(mutant.stdout).text(),new Response(mutant.stderr).text()]);
  expect(await mutant.exited).not.toBe(0);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('US-004-AC2: unknown dialect and nested resource scope cannot be guessed away',async()=>{
 const unknown=schemaDocument({$schema:'https://example.test/custom',type:'object',properties:{id:{type:'string'}}});
 expect((await projectJsonSchemaToProtobuf(unknown,{...options,fields:{'/properties/id':{number:1}}},compiler)).status).toBe('blocked');
 const scoped=schemaDocument({type:'object',properties:{id:{$id:'nested',type:'string'}}});
 const result=await projectJsonSchemaToProtobuf(scoped,{...options,fields:{'/properties/id':{number:1}}},compiler);
 expect(result.status).toBe('blocked');expect(result.issues.some(i=>i.code==='RESOURCE_SCOPE')).toBe(true);
});
