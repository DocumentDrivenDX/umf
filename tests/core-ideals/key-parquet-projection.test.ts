import {test,expect} from 'bun:test';
import {parquetKeyProjectionCases,parquetKeyAuthors} from '../../scripts/core-ideals/key-parquet-projection-cases';
import {projectKeysToParquet,verifyKeysParquetProjection,recoverKeysParquetIdeal} from '../../src/core-ideals/key-parquet-projection';
import {exportParquetCapture} from '../../src/adapters/parquet';
import {importParquetSchema,getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
for(const c of parquetKeyProjectionCases())test('Parquet authored Key: '+c.name,()=>{
 const before=JSON.stringify(c),r=projectKeysToParquet(c.source,c.authors,c.request);expect(JSON.stringify(c)).toBe(before);expect(r.status).toBe(c.expected);expect(r.mappings.length).toBe(c.authors.length);expect(r.residuals.filter(r=>r.path.includes('/keys/')).length).toBe(c.authors.length);expect(r.mappings.every(m=>m.enforcement==='not-expressible')).toBe(true);
 if(r.status==='blocked'){expect(r.target).toBeUndefined();return;}
 const bytes=exportParquetCapture(r.target!),reimported=importParquetSchema(bytes,{id:c.request.id});expect(getParquetFieldMetadata(reimported).fields.length).toBe(c.request.columns.length);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverKeysParquetIdeal(saved,reimported)).toEqual(c.source);expect(exportParquetCapture(saved.target!)).toEqual(bytes);}
});
test('stable IDs and compound field ordering remain distinct from native field IDs',()=>{
 const rows=parquetKeyProjectionCases(),c=rows.find(c=>c.name==='rename-and-reorder')!,r=projectKeysToParquet(c.source,c.authors,c.request);expect(r.mappings.map(m=>m.keyId)).toEqual(['stable-code','stable-id']);expect(r.mappings[1]!.keyName).toBe('Renamed identity');
 const compound=rows.find(c=>c.name==='compound-ordered')!,p=projectKeysToParquet(compound.source,compound.authors,compound.request);expect(p.mappings[0]!.nativePaths).toEqual(['/schema/2','/schema/1']);expect(p.mappings[0]!.columns).toEqual(['external_code','order_id']);expect((getParquetFieldMetadata(p.target!).fields[0]!.nativeField as any).field_id).toBe('17');
});
test('missing or stale authors, changed tuples, ownership conflicts and malformed physical mappings refuse',()=>{
 const c=parquetKeyAuthors();expect(()=>projectKeysToParquet(c.source,c.authors.slice(1),c.request)).toThrow();expect(()=>projectKeysToParquet(c.source,[c.authors[0]!,c.authors[0]!],c.request)).toThrow();
 const missing=structuredClone(c.source);delete missing.modules[0]!.elements[0]!.members;expect(()=>projectKeysToParquet(missing,c.authors,c.request)).toThrow();
 const cross=structuredClone(c.source);cross.modules[0]!.elements.push({id:'other',kind:'record',members:[c.request.columns[0]!.field],extensions:{}});expect(()=>projectKeysToParquet(cross,c.authors,c.request)).toThrow();
 const changed=structuredClone(c.source);(changed.modules[0]!.elements[0]!.keys as any[])[0].id='changed';expect(()=>projectKeysToParquet(changed,c.authors,c.request)).toThrow();
 const wrong=structuredClone(c.request);wrong.columns[0]!.field.module='other';expect(()=>projectKeysToParquet(c.source,c.authors,wrong)).toThrow();
 const duplicate=structuredClone(c.request);duplicate.columns[1]!.fieldId=duplicate.columns[0]!.fieldId!;expect(projectKeysToParquet(c.source,c.authors,duplicate).status).toBe('blocked');
 for(const recordName of ['nul\0','\ud800'])expect(projectKeysToParquet(c.source,c.authors,{...c.request,recordName}).status).toBe('blocked');
 const compound=parquetKeyProjectionCases().find(c=>c.name==='compound-ordered')!,reordered=structuredClone(compound.source);(reordered.modules[0]!.elements[0]!.keys as any[])[0].fields.reverse();expect(()=>projectKeysToParquet(reordered,compound.authors,compound.request)).toThrow();
});
test('forged residuals, edited original bytes and getters cannot recover authorship',()=>{
 const c=parquetKeyAuthors(),r=projectKeysToParquet(c.source,c.authors,c.request),fake=structuredClone(r);fake.residuals=fake.residuals.filter(r=>!r.path.includes('/keys/'));expect(()=>verifyKeysParquetProjection(fake,r.target!)).toThrow();
 const changed=structuredClone(r.target!);(changed.modules[0]!.elements[0]!.extensions['umf.parquet'] as any).bytes='00';expect(()=>recoverKeysParquetIdeal(r,changed)).toThrow();
 let reads=0;expect(()=>projectKeysToParquet(c.source,c.authors,{...c.request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});
test('native-only reimport cannot reconstruct authored keys',async()=>{
 const {classifyParquetKeys,recoverParquetKeySource}=await import('../../src/core-ideals/key-parquet'),c=parquetKeyAuthors(),r=projectKeysToParquet(c.source,c.authors,c.request),bytes=exportParquetCapture(r.target!),native=importParquetSchema(bytes,{id:'native-only'}),observation=classifyParquetKeys(native,{mode:'report',profile:'file-schema'});
 expect(observation.observations.every(o=>o.authorIntent==='unknown'&&o.enforcement==='not-expressible')).toBe(true);expect(observation.target!.modules.every(m=>m.elements.every(e=>e.keys===undefined))).toBe(true);expect(recoverParquetKeySource(observation,observation.target!)).toEqual(bytes);
});
test('native generated-schema proof verifies actual types, duplicate writing and retained file bytes',async()=>{
 const {createHash}=await import('node:crypto'),proof=await Bun.file('fixtures/validation/key-parquet-projection-native.json').json(),corpus=await Bun.file('fixtures/validation/key-parquet-projection-corpus.json').json();expect(proof.runtime).toBe('PyArrow 21.0.0');expect(proof.rows.length).toBe(21);
 for(const row of proof.rows){expect(row.decoded[0]).toEqual(row.decoded[1]);expect(row.requiredNullRefused).toBeTruthy();expect(row.fields.every((f:any)=>f.definitionLevel===0&&f.repetitionLevel===0)).toBe(true);}
 expect(proof.rows.find((r:any)=>r.name==='fixed-binary').shortFixedRefused).toBeTruthy();
 expect(proof.rows.filter((r:any)=>r.inputTruncation).length).toBe(12);
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash as string);
 for(const item of corpus.rows){const c=parquetKeyProjectionCases().find(c=>c.name===item.name)!,r=projectKeysToParquet(c.source,c.authors,c.request);expect(exportParquetCapture(r.target!)).toEqual(new Uint8Array(await Bun.file(item.path).arrayBuffer()));expect(r.mappings).toEqual(item.mappings);}
});
