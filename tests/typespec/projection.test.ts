import {test,expect} from 'bun:test';
import {importTypeSpecSources,projectTypeSpecToJsonSchema,exportJsonSchema,exportJsonSchemaResources,readDocument,writeDocument,coreSchema,typespecJsonSchemaProjectionSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const policy={id:'projected-person',rootFile:'@typespec/json-schema/Person.json',retrievalBase:'https://example.test/emission/',options:{'file-type':'json','int64-strategy':'string'},usage:'native-emission' as const,lossPolicy:'allow-reported-loss' as const};
async function source(){return importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':await Bun.file('fixtures/typespec/upstream/emitters/json-schema/main.tsp').text()},libraries:{'@typespec/json-schema':'1.16.0'}},{id:'source'});}
test('US-013-AC15: native TypeSpec projection preserves emitted reference resources and source',async()=>{
 const doc=await source();const result=await projectTypeSpecToJsonSchema(doc,policy);
 expect(result.status).toBe('projected');expect(result.complete).toBe(false);expect(result.source).toEqual(doc);
 expect(result.issues.map(x=>x.code)).toContain('TYPESPEC_UNREVIEWED_SEMANTICS');expect(result.issues.map(x=>x.code)).toContain('TYPESPEC_NUMERIC_PRECISION');expect(result.issues.map(x=>x.code)).toContain('TYPESPEC_INT64_CONSTRAINTS');
 const validate=createValidator(false);validate.addSchema(coreSchema);expect(validate.compile(typespecJsonSchemaProjectionSchema)(result)).toBe(true);
 const target=readDocument(writeDocument(result.target!,'yaml'),'yaml');expect(target).toEqual(result.target!);
 const native=exportJsonSchema(target);const resources=exportJsonSchemaResources(target);expect(Object.keys(resources).length).toBe(2);
 expect(JSON.parse(native)).toEqual(JSON.parse(result.emission.files[policy.rootFile]!));
 for(const {file,retrievalUri}of result.resources)if(file!==policy.rootFile)expect(JSON.parse(resources[retrievalUri]!)).toEqual(JSON.parse(result.emission.files[file]!));
 await Bun.write('fixtures/typespec/emission/projection.json',JSON.stringify({result,native,resources},null,2)+'\n');
});
test('US-013-AC16: strict policy, absent roots and invalid retrieval/format choices block target use',async()=>{
 const doc=await source();const strict=await projectTypeSpecToJsonSchema(doc,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 const missing=await projectTypeSpecToJsonSchema(doc,{...policy,rootFile:'missing.json'});expect(missing.status).toBe('blocked');expect(missing.target).toBeUndefined();
 for(const retrievalBase of ['relative/','https://example.test/not-directory','https://example.test/?query','file:///tmp/'])await expect(projectTypeSpecToJsonSchema(doc,{...policy,retrievalBase})).rejects.toThrow('Retrieval base');
 await expect(projectTypeSpecToJsonSchema(doc,{...policy,options:{...policy.options,'file-type':'yaml'}})).rejects.toThrow('JSON file type');
});
