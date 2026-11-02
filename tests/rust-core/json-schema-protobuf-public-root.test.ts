// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectJsonSchemaToProtobuf,importJsonSchema,type ProtobufProjectionOptions,type ProtobufSourceCompiler} from '../../src/index-node-v4';

const compiler:ProtobufSourceCompiler={async compile(request){
 const process=Bun.spawn(['go','run','.'],{cwd:'native/protobuf',stdin:new Blob([JSON.stringify(request)]),stdout:'pipe',stderr:'pipe'});
 const [out,stderr]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text()]);
 if(await process.exited)throw new Error(stderr);
 const result=JSON.parse(out);if(result.error)throw new Error(result.error);
 return {compiler:result.compiler,descriptorSet:Uint8Array.from(Buffer.from(result.descriptorHex,'hex'))};
}};
const policy:ProtobufProjectionOptions={id:'projection-target',packageName:'example.record',messageName:'Record',integerType:'int64',lossPolicy:'allow-reported-loss',fields:{'/properties/name':{number:1},'/properties/count':{number:2}}};

test('Rust JSON Schema to Protobuf route retains source, lowers explicit fields, and refuses unsupported roots',async()=>{
 const source=importJsonSchema(JSON.stringify({type:'object',properties:{name:{type:'string'},count:{type:'integer'}},required:['name'],additionalProperties:false}),{id:'json-source',baseUri:'https://example.test/schema'});
 const projected=await projectJsonSchemaToProtobuf(source,policy,compiler);
 expect(projected.status,JSON.stringify(projected)).toBe('projected');expect(projected.source).toEqual(source);expect(projected.target).toBeDefined();
 expect(projected.nativeSource).toContain('optional string field_1 = 1 [json_name = "name"];');
 expect(projected.nativeSource).toContain('optional int64 field_2 = 2 [json_name = "count"];');
 expect(projected.mappings.map(mapping=>mapping.sourcePath)).toEqual(['/properties/name','/properties/count']);
 expect(projected.issues.some(issue=>issue.code==='INSTANCE_ENCODING')).toBe(true);
 const unsupported=importJsonSchema(JSON.stringify({type:'array',items:{type:'string'}}),{id:'array-source',baseUri:'https://example.test/array'});
 const refused=await projectJsonSchemaToProtobuf(unsupported,{...policy,fields:{}},compiler);
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();expect(refused.source).toEqual(unsupported);
 expect(refused.issues.some(issue=>issue.code==='ROOT_TYPE')).toBe(true);
},60_000);
