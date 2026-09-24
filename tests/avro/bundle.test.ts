import {test,expect} from 'bun:test';
import {importAvroSchema,exportAvroSchema,exportAvroBundle,inspectAvro,editAvroNode,getAvroNode,readDocument,writeDocument} from '../../src';
const base='fixtures/avro/upstream/lang/java/avro/src/test/resources/multipleFile/';
const schema=await Bun.file(base+'ApplicationEvent.avsc').text();
const dependency=await Bun.file(base+'DocumentInfo.avsc').text();
const fresh=()=>importAvroSchema(schema,{id:'application',dependencies:[{id:'DocumentInfo.avsc',schema:dependency}]});
test('US-007-AC7: explicit ordered dependencies resolve native names and survive intact',async()=>{
 expect(inspectAvro(importAvroSchema(schema,{id:'alone'})).complete).toBe(false);
 const doc=fresh();expect(inspectAvro(doc).complete).toBe(true);
 expect(inspectAvro(importAvroSchema(schema,{id:'still-alone'})).complete).toBe(false);
 expect(()=>exportAvroSchema(doc)).toThrow('bundle');
 for(const format of ['json','yaml'] as const){
  const bundle=exportAvroBundle(readDocument(writeDocument(doc,format),format));
  expect(JSON.parse(bundle.schema)).toEqual(JSON.parse(schema));
  expect(JSON.parse(bundle.dependencies[0]!.schema)).toEqual(JSON.parse(dependency));
  const back=importAvroSchema(bundle.schema,{id:'application',dependencies:bundle.dependencies});expect(back).toEqual(doc);
 }
 const edited=editAvroNode(doc,'/fields/1/type','"bytes"','DocumentInfo.avsc');
 expect(getAvroNode(doc,'/fields/1/type','DocumentInfo.avsc')).toEqual({kind:'string',value:'string'});
 expect(getAvroNode(edited,'/fields/1/type','DocumentInfo.avsc')).toEqual({kind:'string',value:'bytes'});
 expect(inspectAvro(edited).complete).toBe(true);
 expect(()=>editAvroNode(doc,'/name','"Other"','DocumentInfo.avsc')).toThrow();
 expect(()=>getAvroNode(doc,'','missing')).toThrow();
 await Bun.write('fixtures/avro/dependency-bundle.json',JSON.stringify({original:exportAvroBundle(doc),edited:exportAvroBundle(edited)},null,2)+'\n');
});
test('US-007-AC8: duplicate declarations and unknown dependency representation cannot imply complete support',()=>{
 expect(()=>importAvroSchema(schema,{id:'duplicates',dependencies:[{id:'same',schema:dependency},{id:'same',schema:dependency}]})).toThrow();
 const outOfOrder=importAvroSchema('"ApplicationEvent"',{id:'out-of-order',dependencies:[{id:'event',schema},{id:'info',schema:dependency}]});
 expect(inspectAvro(outOfOrder).complete).toBe(false);
 expect(inspectAvro(outOfOrder).diagnostics.some(d=>d.code==='AVRO_VALIDATOR_LIMIT')).toBe(true);
 const conflict=importAvroSchema(schema,{id:'conflict',dependencies:[{id:'a',schema:dependency},{id:'b',schema:dependency}]});
 expect(inspectAvro(conflict).complete).toBe(false);
 expect(inspectAvro(conflict).diagnostics.some(d=>d.code==='AVRO_VALIDATOR_LIMIT')).toBe(true);
 const doc=fresh();(doc.modules[0]!.elements[0]!.extensions['umf.avro'] as any).dependencies[0].future='keep';
 expect(inspectAvro(doc).complete).toBe(false);expect(()=>exportAvroBundle(doc)).toThrow('Unknown representation');
});
