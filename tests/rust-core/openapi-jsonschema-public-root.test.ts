// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {importOpenapiDocument,projectOpenapiToJsonSchema} from '../../src/index-node-v4';

const source=()=>importOpenapiDocument(JSON.stringify({openapi:'3.1.2',info:{title:'Projection',version:'1'},components:{schemas:{Filter:{type:'object',properties:{name:{type:'string',minLength:1,default:{['\uD800']:'opaque'}},next:{$ref:'#/components/schemas/Filter'}},required:['name'],additionalProperties:false}}}}),{id:'openapi-source',format:'json',baseUri:'https://example.test/api.json'});
const policy={id:'projected-openapi',schemaId:'https://example.test/projected-openapi',pointer:'/components/schemas/Filter',usage:'schema-only',lossPolicy:'allow-reported-loss'} as const;

test('Rust OpenAPI JSON Schema projection preserves recursive constraints and refuses dynamic scope',()=>{
 const document=source();
 const projected=projectOpenapiToJsonSchema(document,policy);
 expect(projected.status).toBe('projected');expect(projected.source).toEqual(document);expect(projected.target).toBeDefined();
 expect(projected.issues.some(issue=>issue.code==='SCHEMA_ONLY')).toBe(true);
 const schema=JSON.parse(projected.nativeSchema!);
 const resolve=(node:any)=>{let current=node;const refs:string[]=[];while(current&&typeof current==='object'&&typeof current.$ref==='string'){const ref=current.$ref;refs.push(ref);const parts=ref.slice(2).split('/').map((part:string)=>part.replace(/~1/g,'/').replace(/~0/g,'~'));current=parts.reduce((value:any,part:string)=>value[part],schema);}return {value:current,refs};};
 const root=resolve({$ref:'#/$defs/schema_0'}).value as any;
 const name=resolve(root.properties.name);expect(name.value.minLength).toBe(1);
 const recursive=resolve(root.properties.next);expect(recursive.refs[recursive.refs.length-1]).toBe('#/$defs/schema_0');
 expect(projected.nativeSchema).toContain('\\ud800');
 const unsupported=importOpenapiDocument(JSON.stringify({openapi:'3.1.2',info:{title:'Projection',version:'1'},components:{schemas:{Filter:{$dynamicRef:'#node'}}}}),{id:'openapi-unsupported',format:'json',baseUri:'https://example.test/api.json'});
 const refused=projectOpenapiToJsonSchema(unsupported,{...policy,schemaId:'https://example.test/refused'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();expect(refused.source).toEqual(unsupported);
 expect(refused.issues.some(issue=>issue.classification==='unsupported')).toBe(true);
});
