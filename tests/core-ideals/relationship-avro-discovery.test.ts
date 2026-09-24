import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importAvroSchema,exportAvroBundle} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import type {Document} from '../../src/model/types';
import corpus from '../../fixtures/avro/relationship-discovery-cases.json';
import proof from '../../fixtures/validation/relationship-avro-discovery-native.json';

// @covers US-045-AC3
// @covers US-045-AC7
for(const c of corpus.cases)test('Avro relationship discovery preserves '+c.id,()=>{
 const source=importAvroSchema(c.schemaText,{id:c.id});
 expect(source.modules.every(m=>!Object.hasOwn(m,'relationships'))).toBe(true);
 source.vocabularies.future={version:'1.0.0'};
 source.extensions={future:{uninterpreted:['retain',1]}};
 const original=exportAvroBundle(source);
 expect(JSON.parse(original.schema)).toEqual(JSON.parse(c.schemaText));
 for(const format of ['json','yaml'] as const){
  const restored=readJsonValue(writeJsonValue(source,format),format) as unknown as Document;
  const bundle=exportAvroBundle(restored);
  expect(bundle.schema).toBe(original.schema);
  expect(bundle.source.extensions).toEqual(source.extensions);
  expect(bundle.source.modules.every(m=>!Object.hasOwn(m,'relationships'))).toBe(true);
 }
});

test('native schema names and custom relationship metadata do not enforce record identity or participation',async()=>{
 expect(proof.versions).toEqual({apache:'1.12.0',fastavro:'1.12.2'});
 expect(proof.cases).toHaveLength(20);
 expect(proof.cases.filter(r=>!r.parse.ok)).toHaveLength(4);
 expect(proof.cases.filter(r=>r.write&&!r.write.ok)).toHaveLength(2);
 for(const r of proof.cases){
  const c=corpus.cases.find(c=>c.id===r.case)!;
  expect(r.parse.ok).toBe(c.expectedParse);
  if(r.write){expect(typeof c.expectedWrite).toBe('boolean');expect<unknown>(r.write.ok).toBe(c.expectedWrite);}
  if(r.reads)for(const reader of ['apache','fastavro'] as const){
   expect<unknown>(r.reads[reader]!.values).toEqual(c.values);
   expect(r.reads[reader]!.bytesConsumed).toBe(r.write!.hex!.length/2);
  }
 }
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash);
});

test('unknown metadata number lexemes and named dependencies survive native/UMF recovery',()=>{
 const schema='{"type":"record","name":"Entry","fields":[{"name":"id","type":"long"}],"relationship":{"future":9007199254740993,"decimal":1.2300}}';
 const source=importAvroSchema('"Entry"',{id:'dependency',dependencies:[{id:'entry',schema}]});
 const before=exportAvroBundle(source);
 expect(before.dependencies[0]!.schema).toContain('9007199254740993');
 expect(before.dependencies[0]!.schema).toContain('1.2300');
 for(const format of ['json','yaml'] as const){
  const restored=readJsonValue(writeJsonValue(source,format),format) as unknown as Document;
  const after=exportAvroBundle(restored);
  expect(after.schema).toBe(before.schema);expect(after.dependencies).toEqual(before.dependencies);
  expect(restored.modules.every(m=>!Object.hasOwn(m,'relationships'))).toBe(true);
 }
});
