import {test,expect} from 'bun:test';
import {classifyAvroRelationships,recoverAvroRelationshipSource,verifyAvroRelationshipClassification} from '../../src/core-ideals/relationship-avro';
import {importAvroSchema,exportAvroBundle} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const cases=(await Bun.file('fixtures/avro/relationship-discovery-cases.json').json()).cases as {id:string;schemaText:string}[];
for(const c of cases)test('Avro relationship classification: '+c.id,()=>{
 const source=importAvroSchema(c.schemaText,{id:c.id}),before=JSON.stringify(source),nativeSource={schema:c.schemaText,dependencies:[]};
 for(const mode of ['strict','report'] as const){
  const r=classifyAvroRelationships(source,{mode,profile:'schema-structure',nativeSource});expect(JSON.stringify(source)).toBe(before);expect(r.status).toBe(mode==='strict'?'blocked':'classified');expect(r.residuals.length).toBeGreaterThan(0);
  if(mode==='strict'){expect(r.target).toBeUndefined();continue;}
  expect(r.target!.modules).toEqual(source.modules);expect(r.observations.length).toBeGreaterThan(0);expect(r.observations.every(o=>o.enforcement==='not-expressible'&&o.authorIntent==='unknown')).toBe(true);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverAvroRelationshipSource(saved,saved.target!)).toEqual(nativeSource);expect(exportAvroBundle(saved.target!).schema).toBe(exportAvroBundle(source).schema);}
 }
});
test('named dependency archives and unknown document content recover without key inference',()=>{
 const nativeSource={schema:' "sales.Order" \n',dependencies:[{id:'orders',schema:cases[0]!.schemaText}]},source=importAvroSchema(nativeSource.schema,{id:'bundle',dependencies:nativeSource.dependencies});source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:[1,'keep']}};
 const r=classifyAvroRelationships(source,{mode:'report',profile:'schema-structure',nativeSource});expect(r.observations.some(o=>o.nativePath==='/dependencies/0/schema')).toBe(true);expect(r.target!.extensions!.future).toEqual(source.extensions.future);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverAvroRelationshipSource(saved,saved.target!)).toEqual(nativeSource);}
});
test('mismatched archive, unsupported profile, existing extension, forged and stale receipts refuse',()=>{
 const nativeSource={schema:cases[0]!.schemaText,dependencies:[]},source=importAvroSchema(nativeSource.schema,{id:'x'}),request={nativeSource,mode:'report',profile:'schema-structure'} as const,r=classifyAvroRelationships(source,request);
 expect(()=>classifyAvroRelationships(source,{...request,nativeSource:{schema:'"string"',dependencies:[]}})).toThrow();expect(()=>classifyAvroRelationships(source,{...request,profile:'future'} as any)).toThrow();
 expect(classifyAvroRelationships(r.target!,request).status).toBe('blocked');
 const fake=structuredClone(r);(fake.observations[0] as any).authorIntent='authored';expect(()=>verifyAvroRelationshipClassification(fake,r.target!)).toThrow();
 const omitted=structuredClone(r);omitted.residuals=[];expect(()=>verifyAvroRelationshipClassification(omitted,r.target!)).toThrow();
 const changed=structuredClone(r.target!);changed.id='changed';expect(()=>recoverAvroRelationshipSource(r,changed)).toThrow();
 let reads=0;expect(()=>classifyAvroRelationships(source,{...request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});
// @covers US-045-AC3 US-045-AC7: structural observations never establish association intent.
test('grammar distinguishes named tokens from record endpoints and ignores metadata schema lookalikes',()=>{
 const nativeSource={schema:' {"type":"record","name":"R","metadata":{"type":"record","name":"Fake","fields":[]},"fields":[{"name":"e","type":{"type":"enum","name":"E","symbols":["a"]}},{"name":"reuse","type":"E"},{"name":"m","type":{"type":"map","values":["null",{"type":"fixed","name":"F","size":2}]}},{"name":"f","type":{"type":"F","items":"NotSchema"}}],"token":9007199254740993} \n',dependencies:[]};
 const source=importAvroSchema(nativeSource.schema,{id:'grammar'}),r=classifyAvroRelationships(source,{nativeSource,mode:'report',profile:'schema-structure'});
 expect(r.observations.map(o=>[o.kind,o.nativePath])).toEqual([
  ['record','/schema'],['named-type-token','/schema/fields/1/type'],['map','/schema/fields/2/type'],['union','/schema/fields/2/type/values'],['named-type-token','/schema/fields/3/type/type']]);
 for(const o of r.observations){expect(o.nameResolution).toBe('unverified');expect(r.residuals.find(v=>v.path===o.nativePath)?.value).toEqual(o.nativeNode);}
 expect(JSON.stringify(r.observations[0]!.nativeNode)).toContain('9007199254740993');
 expect(recoverAvroRelationshipSource(r,r.target!)).toEqual(nativeSource);
 const tampered=structuredClone(r);tampered.observations.pop();expect(()=>verifyAvroRelationshipClassification(tampered,r.target!)).toThrow();
});
test('all supported envelope versions retain modules and unknown content without migration',()=>{
 for(const version of ['0.1.0','0.2.0','0.3.0','0.4.0','0.5.0','0.6.0','0.7.0'] as const){
  const nativeSource={schema:'"string"',dependencies:[]},source=importAvroSchema(nativeSource.schema,{id:'versions'});source.umf=version;
  const r=classifyAvroRelationships(source,{nativeSource,mode:'report',profile:'schema-structure'});expect(r.target!.umf).toBe(version);expect(r.target!.modules).toEqual(source.modules);expect(r.observations).toEqual([]);expect(recoverAvroRelationshipSource(r,r.target!)).toEqual(nativeSource);
 }
});
test('conflicting vocabulary and dependency archive changes block; input accessors are rejected',()=>{
 const nativeSource={schema:'"D"',dependencies:[{id:'dep',schema:'{"type":"record","name":"D","fields":[]}'}]},source=importAvroSchema(nativeSource.schema,{id:'conflicts',dependencies:nativeSource.dependencies});
 const request={nativeSource,mode:'report',profile:'schema-structure'} as const;
 source.vocabularies['umf.avro.relationships']={version:'9.0.0'};expect(classifyAvroRelationships(source,request).status).toBe('blocked');delete source.vocabularies['umf.avro.relationships'];
 expect(()=>classifyAvroRelationships(source,{...request,nativeSource:{...nativeSource,dependencies:[{id:'dep',schema:'"string"'}]}})).toThrow();
 let reads=0;const hostile={...source,get id(){reads++;return 'hostile';}};expect(()=>classifyAvroRelationships(hostile,request)).toThrow();expect(reads).toBe(0);
});
test('published extension package validates observations and rejects malformed node payloads',async()=>{
 const {Registry}=await import('../../src/registry/registry');const {avroRelationshipsPackage}=await import('../../src/core-ideals/relationship-avro');
 const registry=new Registry().register(avroRelationshipsPackage),entry=registry.get('umf.avro.relationships','1.0.0')!;
 const nativeSource={schema:cases[0]!.schemaText,dependencies:[]},r=classifyAvroRelationships(importAvroSchema(nativeSource.schema,{id:'package'}),{nativeSource,mode:'report',profile:'schema-structure'});
 const payload=r.target!.extensions!['umf.avro.relationships'];expect(entry.structure(payload)).toBe(true);
 const bad=structuredClone(payload) as any;bad.observations[0].nativeNode={kind:'invented'};expect(entry.structure(bad)).toBe(false);
});
