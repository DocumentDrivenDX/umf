import {test,expect} from 'bun:test';
import {projectSmithyToJsonSchema,importSmithyJson,createSmithyJavaScriptJsonSchemaBackend,exportJsonSchema} from '../../src';
const text='{"smithy":"2.0","shapes":{"test#X":{"type":"string"}}}';
const source=()=>importSmithyJson(text,{id:'source'});
const policy={id:'target',baseUri:'https://umf.invalid/test.json',rootShape:'test#X',profile:'native-defaults-2020-12',usage:'native-emission',lossPolicy:'allow-reported-loss'} as const;
const backend=(schema:string)=>createSmithyJavaScriptJsonSchemaBackend({assemble:()=>JSON.stringify({valid:true,events:[],modelJson:text}),jsonSchema:()=>schema});
test('US-014-AC16: explicit native projection retains source and blocks strict claims',async()=>{
 const native='{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"string","minLength":1}';
 const result=await projectSmithyToJsonSchema(source(),backend(native),policy);expect(result.status).toBe('projected');expect(result.source).toEqual(source());expect(result.complete).toBe(false);expect(result.nativeSchema).toBe(native);expect(JSON.parse(exportJsonSchema(result.target!)).minLength).toBe(1);
 const strict=await projectSmithyToJsonSchema(source(),backend(native),{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.nativeSchema).toBe(native);
});
test('US-014-AC16: dangling native references and failed emission cannot expose a target',async()=>{
 for(const native of ['{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"#/$defs/Missing"}','{"$schema":"https://json-schema.org/draft/2020-12/schema","default":9007199254740993,"$ref":"#/$defs/Missing"}','invalid']){
  const result=await projectSmithyToJsonSchema(source(),backend(native),policy);expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.nativeSchema).toBe(native);expect(result.issues.some(i=>i.classification==='unsupported')).toBe(true);
 }
 await expect(projectSmithyToJsonSchema(source(),backend('{}'),{...policy,baseUri:'relative'})).rejects.toThrow('absolute retrieval URI');
});
test('US-014-AC17: explicit root-definition profile retains both outputs and refuses missing capability',async()=>{
 const raw='{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"child":{"$ref":"#/$defs/X"}}}';
 const adapted='{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"child":{"$ref":"#/$defs/X"}},"$defs":{"X":{"type":"object","properties":{"child":{"$ref":"#/$defs/X"}}}}}';
 const selected={...policy,profile:'native-root-definition-2020-12'} as const;
 const emitted=await projectSmithyToJsonSchema(source(),{...backend(raw),jsonSchemaWithRootDefinition:()=>adapted},selected);
 expect(emitted.status).toBe('projected');expect(emitted.nativeSchema).toBe(raw);expect(emitted.adaptedSchema).toBe(adapted);expect(emitted.issues.some(i=>i.code==='SMITHY_ROOT_DEFINITION_ADDED')).toBe(true);
 const unavailable=await projectSmithyToJsonSchema(source(),backend(raw),selected);expect(unavailable.status).toBe('blocked');expect(unavailable.target).toBeUndefined();expect(unavailable.nativeSchema).toBe(raw);
 const strict=await projectSmithyToJsonSchema(source(),{...backend(raw),jsonSchemaWithRootDefinition:()=>adapted},{...selected,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.adaptedSchema).toBe(adapted);
});
test('US-014-AC18: service context is explicit, preserved and capability checked',async()=>{
 const schema='{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"string"}';const calls:unknown[]=[];
 const contextual={...backend('invalid'),jsonSchemaForService:(model:string,root:string,service:string,adapted:boolean)=>{calls.push({root,service,adapted});return schema;}};
 const selected={...policy,profile:'native-service-context-2020-12',serviceContext:'test#Service'} as const;
 const result=await projectSmithyToJsonSchema(source(),contextual,selected);expect(result.status).toBe('projected');expect(result.source).toEqual(source());expect(result.policy.serviceContext).toBe('test#Service');expect(result.issues.some(i=>i.code==='SMITHY_SERVICE_CONTEXT')).toBe(true);expect(calls).toEqual([{root:'test#X',service:'test#Service',adapted:false},{root:'test#X',service:'test#Service',adapted:true}]);
 const missing=await projectSmithyToJsonSchema(source(),backend(schema),selected);expect(missing.status).toBe('blocked');expect(missing.target).toBeUndefined();
 const {serviceContext:omitted,...withoutContext}=selected;
 await expect(projectSmithyToJsonSchema(source(),contextual,withoutContext)).rejects.toThrow();
 await expect(projectSmithyToJsonSchema(source(),contextual,{...policy,serviceContext:'test#Service'})).rejects.toThrow();
});
