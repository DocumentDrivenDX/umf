// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createSmithyJavaScriptJsonSchemaBackend,importSmithyJson,projectSmithyToJsonSchema} from '../../src/index-node-v4';

const sourceText='{"smithy":"2.0","shapes":{"test#X":{"type":"string"}}}';
const source=()=>importSmithyJson(sourceText,{id:'smithy-source'});
const policy={id:'smithy-projection',baseUri:'https://example.test/generated.json',rootShape:'test#X',profile:'native-defaults-2020-12',usage:'native-emission',lossPolicy:'allow-reported-loss'} as const;
const backend=(schema:string)=>createSmithyJavaScriptJsonSchemaBackend({assemble:()=>JSON.stringify({valid:true,events:[],modelJson:sourceText}),jsonSchema:()=>schema});

test('public Smithy JSON Schema projection keeps source and refuses strict or dangling-reference targets',async()=>{
 const emitted='{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"string","minLength":1}';
 const result=await projectSmithyToJsonSchema(source(),backend(emitted),policy);
 expect(result.status).toBe('projected');expect(result.source).toEqual(source());expect(result.complete).toBe(false);expect(result.nativeSchema).toBe(emitted);expect(result.target).toBeDefined();
 const strict=await projectSmithyToJsonSchema(source(),backend(emitted),{...policy,lossPolicy:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 const dangling=await projectSmithyToJsonSchema(source(),backend('{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"#/$defs/Missing"}'),policy);
 expect(dangling.status).toBe('blocked');expect(dangling.target).toBeUndefined();expect(dangling.issues.map(issue=>issue.code)).toContain('SMITHY_EMISSION_REFERENCES');
},60_000);
