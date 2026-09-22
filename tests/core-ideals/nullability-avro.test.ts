import {test,expect} from 'bun:test';
import {avroAvailabilitySource,avroNullabilityCases} from '../../scripts/core-ideals/nullability-avro-cases';
import {classifyAvroNullability,verifyAvroNullabilityClassification,recoverAvroNullabilityBundle,avroNullabilityPackage,AVRO_NULLABILITY_EXTENSION,declareCoreNullability,copyJson,readJsonValue,writeJsonValue,Registry,validateDocument} from '../../src';
import type {AvroNullabilityRequest} from '../../src';
const rows=(await Bun.file('fixtures/avro/nullability-cases.json').json()).cases as {id:string;schema:string}[];
const base={scope:'underlying-field-value',carrier:'avro-null',mode:'strict'} as const;
test('Avro underlying-value availability matrix preserves exact source, scope and both formats',()=>{
 for(const c of avroNullabilityCases(rows)){
  const before=structuredClone(c.source),r=classifyAvroNullability(c.source,c.request);
  expect(r.status).toBe(c.status);expect(r.mapping.nullability).toBe(c.expected);expect(c.source).toEqual(before);
  if(!r.target){expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const member=r.target.modules.find(m=>m.id==='avro.fields')!.elements.find(e=>e.id===c.request.column)!;
  expect(member.nullability).toBe(c.expected);expect(member.extensions[AVRO_NULLABILITY_EXTENSION]).toMatchObject({scope:c.request.scope,carrier:c.request.carrier});
  expect(validateDocument(r.target,new Registry().register(avroNullabilityPackage)).valid).toBe(true);
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverAvroNullabilityBundle(back,back.target!)).toEqual({schema:c.request.nativeSource,dependencies:[]});}
 }
},120000);
test('author conflicts, stale/forged receipts and malformed requests refuse without losing unknown content',()=>{
 const nativeSource=rows[0]!.schema,{source,column}=avroAvailabilitySource(nativeSource),request={...base,column,nativeSource};
 const identity={module:'avro.fields',element:column},author=declareCoreNullability(source,identity,'required');
 expect(classifyAvroNullability(author.target,{...request,author}).status).toBe('classified');
 expect(classifyAvroNullability(author.target,request).status).toBe('blocked');
 const wrong=declareCoreNullability(source,identity,'absent-allowed');for(const mode of ['strict','report'] as const)expect(classifyAvroNullability(wrong.target,{...request,mode,author:wrong}).status).toBe('blocked');
 const r=classifyAvroNullability(source,request);
 for(const mutate of [(x:typeof r)=>{x.mapping.nullability='absent-allowed';},(x:typeof r)=>{x.mapping.nativeFragment={kind:'null'};},(x:typeof r)=>{x.request.scope='write-input';}]){const forged=structuredClone(r);mutate(forged);expect(()=>verifyAvroNullabilityClassification(forged,forged.target!)).toThrow();}
 const stale=structuredClone(r.target!);stale.future=true;expect(()=>verifyAvroNullabilityClassification(r,stale)).toThrow();expect(classifyAvroNullability(r.target!,request).status).toBe('blocked');
 const opaque=structuredClone(source);opaque.vocabularies.future={version:'1.0.0'};opaque.modules[0]!.extensions={future:{keep:[1,null,'x']}};const retained=classifyAvroNullability(opaque,request);expect(retained.target!.modules[0]!.extensions).toEqual(opaque.modules[0]!.extensions);
 const invalid=structuredClone(retained.target!);delete (invalid.modules.find(m=>m.id==='avro.fields')!.elements[0]!.extensions[AVRO_NULLABILITY_EXTENSION] as Record<string,unknown>).scope;expect(validateDocument(invalid,new Registry().register(avroNullabilityPackage)).valid).toBe(false);
 expect(()=>classifyAvroNullability(source,{...request,nativeSource:'{}'})).toThrow();let called=false;const unsafe=Object.defineProperty({},'column',{enumerable:true,get(){called=true;return column;}});expect(()=>classifyAvroNullability(source,unsafe as AvroNullabilityRequest)).toThrow();expect(called).toBe(false);
 const noKind=structuredClone(source);delete noKind.modules.find(m=>m.id==='avro.fields')!.elements[0]!.kind;expect(classifyAvroNullability(noKind,request).status).toBe('blocked');
});
test('native names, dependencies and recursive fields resolve without claiming parent availability',()=>{
 const dependencies=[{id:'named',schema:' {"type":"record","name":"types.Child","fields":[{"name":"next","type":["null","Child"]}],"future":9007199254740993}\n'}];
 const text=' {"type":"record","name":"availability.Example","fields":[{"name":"value","type":"types.Child"}]}\n';
 for(const [record,name,expected] of [['availability.Example','value','required'],['types.Child','next','absent-allowed']] as const){
  const {source,column}=avroAvailabilitySource(text,dependencies,record,name);const r=classifyAvroNullability(source,{...base,column,nativeSource:text,dependencies});expect(r.mapping.nullability).toBe(expected);expect(r.target).toBeDefined();expect(recoverAvroNullabilityBundle(r,r.target!)).toEqual({schema:text,dependencies});
  if(record==='types.Child')expect(r.mapping.dependencyId).toBe('named');
 }
 for(const id of ['required-parent','optional-parent']){const text=rows.find(r=>r.id===id)!.schema;const {source,column}=avroAvailabilitySource(text,[],'availability.Child','item');const r=classifyAvroNullability(source,{...base,column,nativeSource:text});expect(r.mapping.nullability).toBe('absent-allowed');expect(r.mapping.basis).toContain('present containing record');}
});
test('invalid structural types and unresolved names stay native with explicit report residuals',()=>{
 for(const type of ['"Missing"','[]','["int","int"]','["null",["int","string"]]','{"type":"fixed","name":"Bad","size":1e-999}','{"type":"enum","name":"Bad","symbols":[]}']){
  const nativeSource='{"type":"record","name":"availability.Example","fields":[{"name":"value","type":'+type+'}]}';const {source,column}=avroAvailabilitySource(nativeSource);
  for(const mode of ['strict','report'] as const){const r=classifyAvroNullability(source,{...base,column,nativeSource,mode});expect(r.mapping.nullability).toBe('unspecified');expect(r.residuals.length).toBeGreaterThan(0);expect(r.status).toBe(mode==='strict'?'blocked':'classified');if(r.target)expect(recoverAvroNullabilityBundle(r,r.target).schema).toBe(nativeSource);}
 }
});
