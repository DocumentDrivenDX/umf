import {createValidator} from '../../src/validation/schema';
import {coreSchema,typespecJsonSchemaEmissionSchema} from '../../src';
import {test,expect} from 'bun:test';
import {importTypeSpecSources,emitTypeSpecJsonSchema,writeDocument,readDocument,exportTypeSpecSources,proposeTypeSpecSourceEdit} from '../../src';
const policy={options:{'file-type':'json','int64-strategy':'string'}};
function source(text:string){return importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':text},libraries:{'@typespec/json-schema':'1.16.0'}},{id:'emission'});}
test('US-013-AC12: native emitter produces stable complete multi-file output after source round trip',async()=>{
 const text=await Bun.file('fixtures/typespec/upstream/emitters/json-schema/main.tsp').text();const doc=source(text);const before=await emitTypeSpecJsonSchema(doc,policy);
 const validator=createValidator(false);validator.addSchema(coreSchema);expect(validator.compile(typespecJsonSchemaEmissionSchema)(before)).toBe(true);expect(before.status).toBe('emitted');expect(Object.keys(before.files).length).toBe(3);expect(before.source).toEqual(doc);expect(before.complete).toBe(false);
 expect(await emitTypeSpecJsonSchema(readDocument(writeDocument(doc,'yaml'),'yaml'),policy)).toEqual(before);
 const person=JSON.parse(before.files['@typespec/json-schema/Person.json']!);expect(person.properties.age.minimum).toBe(0);expect(person.properties.address.$ref).toBe('Address.json');expect(person.properties.nickNames.uniqueItems).toBe(true);
 await Bun.write('fixtures/typespec/json-schema-emission.json',JSON.stringify(before,null,2)+'\n');
});
test('US-013-AC13: emitter policy, invalid compilation and empty selections are explicit',async()=>{
 const doc=source('model M { n: int64; }');
 await expect(emitTypeSpecJsonSchema(doc,{options:{}})).rejects.toThrow('int64-strategy');
 await expect(emitTypeSpecJsonSchema(doc,{options:{...policy.options,'emitter-output-dir':'/elsewhere'}})).rejects.toThrow('Output location');
 expect((await emitTypeSpecJsonSchema(doc,policy)).status).toBe('empty');
 const bad=await emitTypeSpecJsonSchema(source('model M { n: string = 42; }'),policy);expect(bad.status).toBe('blocked');expect(bad.files).toEqual({});
 const options=await emitTypeSpecJsonSchema(doc,{options:{...policy.options,unknownOption:true}});expect(options.status).toBe('blocked');expect(options.files).toEqual({});
});

test('US-013-AC14: numeric policy losses are explicit and edited constraints change native validators',async()=>{
 const text=await Bun.file('fixtures/typespec/emission/numeric.tsp').text();const original=source(text);
 const results=[];
 for(const strategy of ['string','number']){
  const selected={options:{'file-type':'json','int64-strategy':strategy}};
  const result=await emitTypeSpecJsonSchema(original,selected);
  expect(result.status).toBe('emitted');
  expect(exportTypeSpecSources(result.source).files['main.tsp']).toBe(text);
  expect(result.limitations.some(x=>x.includes('9007199254740993 becomes 9007199254740992'))).toBe(true);
  expect(result.limitations.some(x=>x.includes('omits int64/uint64 bounds'))).toBe(true);
  const schema=JSON.parse(result.files['@typespec/json-schema/NumericBoundary.json']!);
  // Record actual native behavior, including loss; never label this semantic equivalence.
  expect(schema.properties.literal.const).toBe(9007199254740992);
  expect(schema.properties.signed.type).toBe(strategy==='string'?'string':'integer');
  expect(schema.properties.unsigned.minimum).toBeUndefined();
  expect(await emitTypeSpecJsonSchema(readDocument(writeDocument(original,'yaml'),'yaml'),selected)).toEqual(result);
  const edit=proposeTypeSpecSourceEdit(original,'main.tsp',text.replace('@maxValue(100)','@maxValue(50)'));
  const edited=await emitTypeSpecJsonSchema(edit.document,selected);
  expect(edited.status).toBe('emitted');
  expect(JSON.parse(edited.files['@typespec/json-schema/NumericBoundary.json']!).properties.percent.maximum).toBe(50);
  expect(schema.properties.percent.maximum).toBe(100);
  results.push({strategy,original:result,edited});
 }
 expect(exportTypeSpecSources(original).files['main.tsp']).toBe(text);
 await Bun.write('fixtures/typespec/emission/numeric-results.json',JSON.stringify(results,null,2)+'\n');
});
