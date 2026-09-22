import {test,expect} from 'bun:test';
import {parquetAvailabilitySource,parquetNullabilityCases} from '../../scripts/core-ideals/nullability-parquet-cases';
import {classifyParquetNullability,verifyParquetNullabilityClassification,recoverParquetNullabilityBytes,parquetNullabilityPackage,PARQUET_NULLABILITY_EXTENSION,declareCoreNullability,copyJson,readJsonValue,writeJsonValue,Registry,validateDocument} from '../../src';
import type {ParquetNullabilityRequest} from '../../src';
const fixture=await Bun.file('fixtures/validation/nullability-parquet-native.json').json();
const base={scope:'row-leaf-value',carrier:'definition-level',mode:'strict'} as const;
test('native-backed row/entry context matrix preserves exact bytes, metadata and both serializations',async()=>{
 for(const c of await parquetNullabilityCases(fixture.cases)){
  const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),before=structuredClone(c.source),r=classifyParquetNullability(c.source,c.request);
  expect(r.status).toBe(c.status);expect(r.mapping.nullability).toBe(c.expected);expect(c.source).toEqual(before);
  if(!r.target){expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const member=r.target.modules.find(m=>m.id==='parquet.fields')!.elements.find(e=>e.id==='schema:'+c.request.index)!;
  expect(member.extensions[PARQUET_NULLABILITY_EXTENSION]).toMatchObject({scope:c.request.scope,carrier:c.request.carrier});expect(validateDocument(r.target,new Registry().register(parquetNullabilityPackage)).valid).toBe(true);
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverParquetNullabilityBytes(back,back.target!)).toEqual(bytes);}
 }
},300000);
test('optional ancestors contribute absence while repeated paths require an explicit entry context',async()=>{
 const row=fixture.cases.find((r:any)=>r.id==='struct-1-0-present-1');const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer()),source=parquetAvailabilitySource(bytes,2);
 const result=classifyParquetNullability(source,{...base,index:2});expect(result.mapping.nullability).toBe('absent-allowed');expect(result.mapping.absencePaths).toEqual(['/schema/1/repetition_type']);expect(result.mapping.contextIndex).toBe(0);
 const list=fixture.cases.find((r:any)=>r.id==='list-1-0-present-1'),listSource=parquetAvailabilitySource(new Uint8Array(await Bun.file(list.path).arrayBuffer()),3);
 expect(classifyParquetNullability(listSource,{...base,index:3}).status).toBe('blocked');const entry=classifyParquetNullability(listSource,{...base,index:3,scope:'repeated-element-value'});expect(entry.mapping.nullability).toBe('required');expect(entry.mapping.contextIndex).toBe(2);expect(entry.mapping.absencePaths).toEqual([]);
});
test('author conflicts, altered scope/ancestry, changed targets and unsafe requests refuse',async()=>{
 const row=fixture.cases.find((r:any)=>r.id==='scalar-0-0-present-1'),bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer()),source=parquetAvailabilitySource(bytes,1),request={...base,index:1};
 const identity={module:'parquet.fields',element:'schema:1'},author=declareCoreNullability(source,identity,'required');expect(classifyParquetNullability(author.target,{...request,author}).status).toBe('classified');expect(classifyParquetNullability(author.target,request).status).toBe('blocked');
 const conflict=declareCoreNullability(source,identity,'absent-allowed');for(const mode of ['strict','report'] as const)expect(classifyParquetNullability(conflict.target,{...request,mode,author:conflict}).status).toBe('blocked');
 const r=classifyParquetNullability(source,request);for(const alter of [(v:typeof r)=>{v.mapping.ancestry[0]!.repetition='optional';},(v:typeof r)=>{v.mapping.contextIndex=99;},(v:typeof r)=>{v.mapping.scope='write-input';},(v:typeof r)=>{v.mapping.nativeFragment=null;}]){const forged=structuredClone(r);alter(forged);expect(()=>verifyParquetNullabilityClassification(forged,forged.target!)).toThrow();}
 const stale=structuredClone(r.target!);stale.future=true;expect(()=>verifyParquetNullabilityClassification(r,stale)).toThrow();expect(classifyParquetNullability(r.target!,request).status).toBe('blocked');
 const opaque=structuredClone(source);opaque.vocabularies.future={version:'1.0.0'};opaque.modules[0]!.extensions={future:{nested:[null,true]}};const retained=classifyParquetNullability(opaque,request);expect(retained.target!.modules[0]!.extensions).toEqual(opaque.modules[0]!.extensions);
 const invalid=structuredClone(retained.target!);delete (invalid.modules.find(m=>m.id==='parquet.fields')!.elements[0]!.extensions[PARQUET_NULLABILITY_EXTENSION] as Record<string,unknown>).contextIndex;expect(validateDocument(invalid,new Registry().register(parquetNullabilityPackage)).valid).toBe(false);
 for(const index of [0,-1,999,0.5])expect(()=>classifyParquetNullability(source,{...request,index})).toThrow();let called=false;const unsafe=Object.defineProperty({},'index',{enumerable:true,get(){called=true;return 1;}});expect(()=>classifyParquetNullability(source,unsafe as ParquetNullabilityRequest)).toThrow();expect(called).toBe(false);
 const noKind=structuredClone(source);delete noKind.modules.find(m=>m.id==='parquet.fields')!.elements[0]!.kind;expect(classifyParquetNullability(noKind,request).status).toBe('blocked');
});
test('legacy repeated primitive entries remain required within the selected entry, with exact byte recovery',async()=>{
 for(const [name,index] of [['list-primitive',2],['list-nested-repeated',3]] as const){
  const bytes=new Uint8Array(await Bun.file(`fixtures/parquet/containers/${name}.parquet`).arrayBuffer()),source=parquetAvailabilitySource(bytes,index);
  expect(classifyParquetNullability(source,{...base,index}).status).toBe('blocked');
  const result=classifyParquetNullability(source,{...base,index,scope:'repeated-element-value'});expect(result.status).toBe('classified');expect(result.mapping.nullability).toBe('required');expect(result.mapping.contextIndex).toBe(index);expect(result.mapping.absencePaths).toEqual([]);expect(recoverParquetNullabilityBytes(result,result.target!)).toEqual(bytes);
 }
});
