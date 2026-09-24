import {test,expect} from 'bun:test';
import {relationshipAvroCase,relationshipAvroProjectionCases} from '../../scripts/core-ideals/relationship-avro-projection-cases';
import {projectRelationshipToAvro,verifyRelationshipAvroProjection,recoverRelationshipAvroIdeal,recoverRelationshipAvroNative} from '../../src/core-ideals/relationship-avro-projection';
import {classifyAvroRelationships,recoverAvroRelationshipSource} from '../../src/core-ideals/relationship-avro';
import {importAvroSchema} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
// @covers US-045-AC4 US-045-AC5 US-045-AC6 US-045-AC7 US-045-AC8
for(const c of relationshipAvroProjectionCases())test('authored Avro relationship: '+c.name,()=>{
 const before=JSON.stringify(c),r=projectRelationshipToAvro(c.source,c.author,c.request);expect(r.status).toBe(c.expected);expect(JSON.stringify(c)).toBe(before);expect(r.residuals.length).toBeGreaterThan(0);
 for(const loss of r.residuals){let value:any=(loss.path==='/request'||loss.path.startsWith('/request/'))?r:c.source;for(const k of loss.path==='/'?[]:loss.path.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~')))value=value[k];expect(loss.value).toEqual(value);}
 if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.nativeArchive).toBeUndefined();expect(r.mappings).toEqual([]);return;}
 const fresh=importAvroSchema(r.nativeArchive!.schema,{id:'fresh'}),classified=classifyAvroRelationships(fresh,{nativeSource:r.nativeArchive!,mode:'report',profile:'schema-structure'});
 expect(classified.target!.modules).toEqual(fresh.modules);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;
  expect(recoverRelationshipAvroIdeal(saved,classified.target!)).toEqual(c.source);expect(recoverRelationshipAvroNative(saved,fresh)).toEqual(r.nativeArchive!);expect(recoverAvroRelationshipSource(classified,classified.target!)).toEqual(r.nativeArchive!);}
 const fake=structuredClone(r);fake.residuals.pop();expect(()=>verifyRelationshipAvroProjection(fake,r.target!)).toThrow();
 expect(()=>verifyRelationshipAvroProjection(r,importAvroSchema('"string"',{id:'changed'}))).toThrow();
});
test('forged author, stale keys/components, reordered tuples and accessors reject',()=>{
 const c=relationshipAvroCase('composite');
 const stale=structuredClone(c.source);(stale.modules[0]!.elements.find(e=>e.id==='Customer.id') as any).description='changed';expect(()=>projectRelationshipToAvro(stale,c.author,c.request)).toThrow();
 const author=structuredClone(c.author);author.request.name='forged';expect(()=>projectRelationshipToAvro(c.source,author,c.request)).toThrow();
 const swapped={...c.request,components:[...c.request.components].reverse()};expect(projectRelationshipToAvro(c.source,c.author,swapped).status).toBe('blocked');
 let reads=0;expect(()=>projectRelationshipToAvro(c.source,c.author,{...c.request,get shape(){reads++;return 'one' as const;}})).toThrow();expect(reads).toBe(0);
});
test('float Key equality remains invalid instead of being legitimized by an Avro float carrier',()=>{
 const c=relationshipAvroCase(),source=structuredClone(c.source);source.modules[0]!.elements.find(e=>e.id==='Customer.id')!.scalarType='float';expect(()=>projectRelationshipToAvro(source,c.author,{...c.request,components:c.request.components.map(v=>({...v,type:'float'}))})).toThrow();
});
test('generated authored carriers match the pinned native validation evidence',async()=>{
 const {createHash}=await import('node:crypto'),corpus=await Bun.file('fixtures/avro/relationship-projection-cases.json').json(),proof=await Bun.file('fixtures/validation/relationship-avro-projection-native.json').json();
 expect(corpus.cases.length).toBe(36);expect(proof.versions).toEqual({apache:'1.12.0',fastavro:'1.12.2'});expect(proof.cases.length).toBe(24);
 for(const c of relationshipAvroProjectionCases()){const row=corpus.cases.find((v:any)=>v.name===c.name),r=projectRelationshipToAvro(c.source,c.author,c.request);expect(row.status).toBe(r.status);expect(row.schemaText).toBe(r.nativeArchive?.schema);}
 for(const row of proof.cases){expect(corpus.cases.find((c:any)=>c.name===row.case).status).toBe('projected');for(const reader of ['apache','fastavro'])expect(row.reads[reader].bytesConsumed).toBe(row.hex.length/2);expect(row.reads.apache.values).toEqual(row.reads.fastavro.values);}
 for(const [p,h] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')).toBe(h as string);
});
