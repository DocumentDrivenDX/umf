import {test,expect} from 'bun:test';
import {avroKeyAuthors,avroKeyProjectionCases} from '../../scripts/core-ideals/key-avro-projection-cases';
import {projectKeysToAvro,verifyKeysAvroProjection,recoverKeysAvroIdeal} from '../../src/core-ideals/key-avro-projection';
import {importAvroSchema,exportAvroSchema} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
for(const c of avroKeyProjectionCases())test('Avro authored Key: '+c.name,()=>{
 const before=JSON.stringify(c),r=projectKeysToAvro(c.source,c.authors,c.request);expect(JSON.stringify(c)).toBe(before);expect(r.status).toBe(c.expected);expect(r.mappings.length).toBe(c.authors.length);expect(r.residuals.filter(r=>r.path.includes('/keys/')).length).toBe(c.authors.length);expect(r.mappings.every(m=>m.enforcement==='not-expressible')).toBe(true);
 if(r.status==='blocked'){expect(r.target).toBeUndefined();return;}
 const native=exportAvroSchema(r.target!),parsed=JSON.parse(native);expect(parsed.keys).toBeUndefined();expect(parsed.primary_key).toBeUndefined();
 const reimported=importAvroSchema(native,{id:c.request.id});
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverKeysAvroIdeal(saved,reimported)).toEqual(c.source);expect(exportAvroSchema(saved.target!)).toBe(native);}
});
test('stable key identities, explicit physical order and alternate residuals remain separate',()=>{
 const rows=avroKeyProjectionCases(),rename=rows.find(c=>c.name==='rename-and-reorder')!,r=projectKeysToAvro(rename.source,rename.authors,rename.request);expect(r.mappings.map(m=>m.keyId)).toEqual(['stable-code','stable-id']);expect(r.mappings[1]!.keyName).toBe('Renamed identity');
 const compound=rows.find(c=>c.name==='compound-ordered')!,p=projectKeysToAvro(compound.source,compound.authors,compound.request);expect(p.mappings[0]!.nativePaths).toEqual(['/fields/1','/fields/0']);expect(p.mappings[0]!.columns).toEqual(['external_code','order_id']);
});
test('missing authors, stale tuples, absent membership, invalid names and mismatched fields refuse',()=>{
 const c=avroKeyAuthors();expect(()=>projectKeysToAvro(c.source,c.authors.slice(1),c.request)).toThrow();expect(()=>projectKeysToAvro(c.source,[c.authors[0]!,c.authors[0]!],c.request)).toThrow();
 const d=structuredClone(c.source);delete d.modules[0]!.elements[0]!.members;expect(()=>projectKeysToAvro(d,c.authors,c.request)).toThrow();
 const changed=structuredClone(c.source);changed.modules[0]!.elements[1]!.description='changed';expect(()=>projectKeysToAvro(changed,c.authors,c.request)).toThrow();
 const wrong=structuredClone(c.request);wrong.columns[0]!.field.module='other';expect(()=>projectKeysToAvro(c.source,c.authors,wrong)).toThrow();
 for(const recordName of ['1bad','bad\n','bad.name','long'])expect(projectKeysToAvro(c.source,c.authors,{...c.request,recordName}).status).toBe('blocked');
 const compound=avroKeyProjectionCases().find(c=>c.name==='compound-ordered')!,reordered=structuredClone(compound.source);(reordered.modules[0]!.elements[0]!.keys as any[])[0].fields.reverse();expect(()=>projectKeysToAvro(reordered,compound.authors,compound.request)).toThrow();
});
test('forged per-key reports, edited native schemas and getters refuse',()=>{
 const c=avroKeyAuthors(),r=projectKeysToAvro(c.source,c.authors,c.request),fake=structuredClone(r);fake.mappings[0]!.keyId='other';expect(()=>verifyKeysAvroProjection(fake,r.target!)).toThrow();
 const missing=structuredClone(r);missing.residuals=missing.residuals.filter(r=>!r.path.includes('/keys/'));expect(()=>verifyKeysAvroProjection(missing,r.target!)).toThrow();
 const native=JSON.parse(exportAvroSchema(r.target!));native.fields[0].name='changed';expect(()=>recoverKeysAvroIdeal(r,importAvroSchema(JSON.stringify(native),{id:c.request.id}))).toThrow();
 let reads=0;expect(()=>projectKeysToAvro(c.source,c.authors,{...c.request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});
test('generated native proof preserves duplicates and the boolean null coercion counterexample',async()=>{
 const {createHash}=await import('node:crypto'),proof=await Bun.file('fixtures/validation/key-avro-projection-native.json').json();expect(proof.versions).toEqual({apache:'1.12.0',fastavro:'1.12.2'});expect(proof.rows.length).toBe(32);
 let refused=0,coerced=0;for(const row of proof.rows){for(const reader of ['apache','fastavro'])expect(row.reads[reader]).toEqual(row.values);refused+=row.refusals.length;coerced+=row.coercions.length;}
 expect(refused).toBe(63);expect(coerced).toBe(1);const coercion=proof.rows.find((r:any)=>r.case==='boolean'&&r.writer==='fastavro').coercions[0];expect(coercion.decoded.order_id).toBe(false);
 const c=avroKeyProjectionCases().find(c=>c.name==='boolean')!,r=projectKeysToAvro(c.source,c.authors,c.request);expect(r.residuals.some(r=>r.reason.includes('coerce null input to false'))).toBe(true);
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash as string);
 const generated=await Bun.file('fixtures/avro/key-projection-generated.json').json();for(const item of generated.cases){const c=avroKeyProjectionCases().find(c=>c.name===item.name)!,r=projectKeysToAvro(c.source,c.authors,c.request);expect(exportAvroSchema(r.target!)).toBe(item.schemaText);expect(r.mappings).toEqual(item.keyMappings);}
});
test('reimport without retained authors cannot reconstruct core identity',async()=>{
 const {classifyAvroKeys,recoverAvroKeySource}=await import('../../src/core-ideals/key-avro'),c=avroKeyAuthors(),r=projectKeysToAvro(c.source,c.authors,c.request),schema=exportAvroSchema(r.target!),nativeSource={schema,dependencies:[]};
 const observation=classifyAvroKeys(importAvroSchema(schema,{id:'native-only'}),{mode:'report',profile:'schema-declarations',nativeSource});expect(observation.observations.every(o=>o.authorIntent==='unknown'&&o.enforcement==='not-expressible')).toBe(true);expect(observation.target!.modules.every(m=>m.elements.every(e=>e.keys===undefined))).toBe(true);expect(recoverAvroKeySource(observation,observation.target!)).toEqual(nativeSource);
});
test('cross-record ownership, changed stable key IDs and duplicate physical mappings refuse',()=>{
 const c=avroKeyAuthors(),cross=structuredClone(c.source);cross.modules[0]!.elements.push({id:'other-owner',kind:'record',members:[c.request.columns[0]!.field],extensions:{}});expect(()=>projectKeysToAvro(cross,c.authors,c.request)).toThrow();
 const changed=structuredClone(c.source);(changed.modules[0]!.elements[0]!.keys as any[])[0].id='different';expect(()=>projectKeysToAvro(changed,c.authors,c.request)).toThrow();
 const duplicate=structuredClone(c.request);duplicate.columns[1]!.name=duplicate.columns[0]!.name;expect(()=>projectKeysToAvro(c.source,c.authors,duplicate)).toThrow();
 const missing=structuredClone(c.request);missing.columns.pop();expect(()=>projectKeysToAvro(c.source,c.authors,missing)).toThrow();
});
