import {test,expect} from 'bun:test';
import {assembleSmithyDocument,importSmithySources,importSmithyJson,exportSmithySources,getSmithyNode,smithyAssemblyResultSchema,coreSchema,createSmithyJavaScriptBackend} from '../../src';
import {createValidator} from '../../src/validation/schema';
const source=()=>importSmithySources({files:{'model.smithy':'$version: "2"\nnamespace test\nstring X'}},{id:'source'});
const model='{"smithy":"2.0","metadata":{"exact":9007199254740993},"shapes":{"test#X":{"type":"string"}}}';
test('US-014-AC10: assembly contract retains exact model/source and isolates trusted backend input',async()=>{
 const doc=source();const result=await assembleSmithyDocument(doc,{identity:'contract-test',assemble(files){files['model.smithy']='mutated';return JSON.stringify({valid:true,events:[],modelJson:model});}},{id:'assembled'});
 expect(result.status).toBe('assembled');expect(result.source).toEqual(doc);expect(result.complete).toBe(false);expect(getSmithyNode(result.model!,'/metadata/exact')).toEqual({kind:'number',value:'9007199254740993'});
 expect(exportSmithySources(doc).files['model.smithy']).toContain('string X');expect(result.nativeModel).toBe(model);
 const check=createValidator(false);check.addSchema(coreSchema);expect(check.compile(smithyAssemblyResultSchema)(result)).toBe(true);
});
test('US-014-AC11: native rejection, runtime errors and malformed output expose no assembled model',async()=>{
 for(const response of [JSON.stringify({valid:false,events:[{id:'Target',severity:'ERROR',message:'Missing target'}]}),'{"valid":true,"events":[]}',JSON.stringify({valid:true,events:[{id:'bad',severity:'ERROR',message:'error'}],modelJson:model}),JSON.stringify({valid:true,events:[],modelJson:'{}'}),'invalid']){
  const result=await assembleSmithyDocument(source(),{identity:'test',assemble:()=>response},{id:'model'});expect(result.status).toBe('blocked');expect(result.model).toBeUndefined();expect(result.nativeModel).toBeUndefined();
 }
 const failed=await assembleSmithyDocument(source(),{identity:'test',assemble(){throw new Error('Unsupported reflection');}},{id:'model'});expect(failed.issues[0]!.message).toContain('Unsupported reflection');expect(failed.source).toEqual(source());
});
test('US-014-AC10: AST dependency IDs map to explicit supplied native files',async()=>{
 const doc=importSmithyJson('{"smithy":"2.0"}',{id:'ast',dependencies:[{id:'dependency',schema:model}]});let names:string[]=[];
 const result=await assembleSmithyDocument(doc,createSmithyJavaScriptBackend({assemble(text){const files=JSON.parse(text);names=Object.keys(files);return JSON.stringify({valid:true,events:[],modelJson:model});}}),{id:'model'});
 expect(names).toEqual(['root.json','dependency-0.json']);expect(result.inputs).toEqual([{file:'root.json'},{file:'dependency-0.json',dependencyId:'dependency'}]);expect(result.status).toBe('assembled');
});
