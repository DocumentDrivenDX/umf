import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {classifyAvroKeys,recoverAvroKeySource,verifyAvroKeyClassification} from '../../src/core-ideals/key-avro';
import {importAvroSchema,exportAvroBundle} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const cases=(await Bun.file('fixtures/avro/key-discovery-cases.json').json()).cases as {id:string;schemaText:string}[];
for(const c of cases)test('Avro Key classification: '+c.id,()=>{
 const source=importAvroSchema(c.schemaText,{id:c.id}),before=JSON.stringify(source),nativeSource={schema:c.schemaText,dependencies:[]};
 for(const mode of ['strict','report'] as const){
  const r=classifyAvroKeys(source,{mode,profile:'schema-declarations',nativeSource});expect(JSON.stringify(source)).toBe(before);expect(r.status).toBe(mode==='strict'?'blocked':'classified');expect(r.residuals.length).toBeGreaterThan(0);
  if(mode==='strict'){expect(r.target).toBeUndefined();continue;}
  expect(r.target!.modules).toEqual(source.modules);expect(r.observations.length).toBeGreaterThan(0);expect(r.observations.every(o=>o.enforcement==='not-expressible'&&o.authorIntent==='unknown')).toBe(true);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverAvroKeySource(saved,saved.target!)).toEqual(nativeSource);expect(exportAvroBundle(saved.target!).schema).toBe(exportAvroBundle(source).schema);}
 }
});
test('named dependency archives and unknown document content recover without key inference',()=>{
 const nativeSource={schema:' "sales.Order" \n',dependencies:[{id:'orders',schema:cases[0]!.schemaText}]},source=importAvroSchema(nativeSource.schema,{id:'bundle',dependencies:nativeSource.dependencies});source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:[1,'keep']}};
 const r=classifyAvroKeys(source,{mode:'report',profile:'schema-declarations',nativeSource});expect(r.observations[0]!.nativePath).toBe('/dependencies/0/schema');expect(r.target!.extensions!.future).toEqual(source.extensions.future);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverAvroKeySource(saved,saved.target!)).toEqual(nativeSource);}
});
test('mismatched archive, unsupported profile, existing extension, forged and stale receipts refuse',()=>{
 const nativeSource={schema:cases[0]!.schemaText,dependencies:[]},source=importAvroSchema(nativeSource.schema,{id:'x'}),request={nativeSource,mode:'report',profile:'schema-declarations'} as const,r=classifyAvroKeys(source,request);
 expect(()=>classifyAvroKeys(source,{...request,nativeSource:{schema:'"string"',dependencies:[]}})).toThrow();expect(()=>classifyAvroKeys(source,{...request,profile:'future'} as any)).toThrow();
 expect(classifyAvroKeys(r.target!,request).status).toBe('blocked');
 const fake=structuredClone(r);(fake.observations[0] as any).authorIntent='authored';expect(()=>verifyAvroKeyClassification(fake,r.target!)).toThrow();
 const omitted=structuredClone(r);omitted.residuals=[];expect(()=>verifyAvroKeyClassification(omitted,r.target!)).toThrow();
 const changed=structuredClone(r.target!);changed.id='changed';expect(()=>recoverAvroKeySource(r,changed)).toThrow();
 let reads=0;expect(()=>classifyAvroKeys(source,{...request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});
test('two pinned codecs preserve duplicates and expose narrowing instead of proving uniqueness',async()=>{
 const proof=await Bun.file('fixtures/validation/key-avro-discovery-native.json').json();expect(proof.versions).toEqual({apache:'1.12.0',fastavro:'1.12.2'});expect(proof.cases.length).toBe(24);expect(proof.cases.filter((c:any)=>!c.write.ok).length).toBe(4);
 for(const c of proof.cases){expect(c.write.ok).toBe(c.expectedWrite);if(c.write.ok)for(const reader of ['apache','fastavro'])expect(c.reads[reader].bytesConsumed).toBe(c.write.hex.length/2);}
 for(const c of proof.containers)for(const reader of ['apache','fastavro'])expect(c.reads[reader]).toEqual([{id:1,code:'a'},{id:1,code:'a'}]);
 for(const c of proof.cases.filter((c:any)=>c.id==='float-narrowing'))for(const reader of ['apache','fastavro'])expect(c.reads[reader].values).toEqual([{value:1},{value:1}]);
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash as string);
});
