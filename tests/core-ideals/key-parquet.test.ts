import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {classifyParquetKeys,verifyParquetKeyClassification,recoverParquetKeySource} from '../../src/core-ideals/key-parquet';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';
import {captureParquet,exportParquetCapture} from '../../src/adapters/parquet';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const proof=await Bun.file('fixtures/validation/key-parquet-discovery-native.json').json();
for(const row of proof.cases)test('Parquet Key observation: '+row.id,async()=>{
 const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer()),source=row.expectedSchema==='blocked'?captureParquet(bytes,{id:row.id}):importParquetSchema(bytes,{id:row.id}),before=JSON.stringify(source);
 for(const mode of ['strict','report'] as const){const r=classifyParquetKeys(source,{mode,profile:'file-schema'});expect(JSON.stringify(source)).toBe(before);expect(r.status).toBe(mode==='strict'||row.expectedSchema==='blocked'?'blocked':'classified');expect(r.residuals.length).toBeGreaterThan(0);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(exportParquetCapture(saved.source)).toEqual(bytes);}continue;}
  expect(r.target!.modules).toEqual(source.modules);expect(r.observations.every(o=>o.enforcement==='not-expressible'&&o.authorIntent==='unknown')).toBe(true);
  const leaves=r.observations.filter(o=>o.kind==='physical-leaf');expect(leaves.map(o=>({path:o.path.join('.'),definitionLevel:o.definitionLevel,repetitionLevel:o.repetitionLevel}))).toEqual(row.columns.map((c:any)=>({path:c.path,definitionLevel:c.definitionLevel,repetitionLevel:c.repetitionLevel})));
  if(row.id==='repeated-list'){expect(r.observations.some(o=>o.kind==='physical-group')).toBe(true);expect(leaves[0]!.repetitionLevel).toBe(1);}
  if(row.id.startsWith('required'))expect((leaves[0]!.nativeField as any).field_id).toBe('17');
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverParquetKeySource(saved,saved.target!)).toEqual(bytes);expect(exportParquetCapture(saved.target!)).toEqual(bytes);}
 }
});
test('opaque UMF content, metadata and malformed bytes remain separate from identity',async()=>{
 const bytes=new Uint8Array(await Bun.file(proof.cases[0].path).arrayBuffer()),source=importParquetSchema(bytes,{id:'unknown'});source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:['keep',{number:'9007199254740993'}]}};
 const r=classifyParquetKeys(source,{mode:'report',profile:'file-schema'});expect(r.target!.extensions!.future).toEqual(source.extensions.future);expect(recoverParquetKeySource(r,r.target!)).toEqual(bytes);
 const malformed=captureParquet(new Uint8Array([1,2,3]),{id:'bad'}),blocked=classifyParquetKeys(malformed,{mode:'report',profile:'file-schema'});expect(blocked.status).toBe('blocked');expect(blocked.target).toBeUndefined();expect(blocked.observations).toEqual([]);expect(exportParquetCapture(blocked.source)).toEqual(new Uint8Array([1,2,3]));
});
test('existing observations, unknown profiles, forged identity, stale bytes and getters refuse',async()=>{
 const bytes=new Uint8Array(await Bun.file(proof.cases[0].path).arrayBuffer()),source=importParquetSchema(bytes,{id:'x'}),request={mode:'report',profile:'file-schema'} as const,r=classifyParquetKeys(source,request);
 expect(classifyParquetKeys(r.target!,request).status).toBe('blocked');expect(()=>classifyParquetKeys(source,{...request,profile:'future'} as any)).toThrow();
 const fake=structuredClone(r);(fake.observations[0] as any).authorIntent='authored';expect(()=>verifyParquetKeyClassification(fake,r.target!)).toThrow();
 const missing=structuredClone(r);missing.residuals=[];expect(()=>verifyParquetKeyClassification(missing,r.target!)).toThrow();
 const edited=structuredClone(r.target!);(edited.modules[0]!.elements[0]!.extensions['umf.parquet'] as any).bytes='00';expect(()=>recoverParquetKeySource(r,edited)).toThrow();
 let reads=0;expect(()=>classifyParquetKeys(source,{...request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});
test('pinned native counterexamples and source fingerprints match',async()=>{
 expect(proof.runtime).toBe('PyArrow 21.0.0');expect(proof.cases.length).toBe(8);expect(proof.requiredNullControl.refused).toBe(true);
 const sorting=proof.cases.find((r:any)=>r.id==='sorting-not-enforced');expect(sorting.sortingDeclared).toBe(true);expect(sorting.rows[0].id).toBeGreaterThan(sorting.rows.at(-1).id);
 for(const id of ['required-embedded','required-no-arrow','nullable','repeated-list']){const r=proof.cases.find((c:any)=>c.id===id);expect(r.rows[0]).toEqual(r.rows[1]);}
 expect(proof.cases.find((r:any)=>r.id==='float-narrowing').rows).toEqual([{v:1},{v:1}]);expect(proof.cases.find((r:any)=>r.id==='integer-input-truncation').rows).toEqual([{v:1},{v:1}]);
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash as string);
});
