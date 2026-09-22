import {test,expect} from 'bun:test';
import {avroNullabilityProjectionCases} from '../../scripts/core-ideals/nullability-avro-projection-cases';
import {projectNullabilityToAvro,recoverNullabilityFromAvro} from '../../src/core-ideals/nullability-avro-projection';
import {exportAvroSchema} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
test('authored Avro availability projects null carriers and recovers every ideal and residual',()=>{
 for(const c of avroNullabilityProjectionCases()){
  const before=structuredClone(c.author),r=projectNullabilityToAvro(c.author,c.request);expect(r.status).toBe(c.status);expect(c.author).toEqual(before);
  if(!r.target){expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const text=exportAvroSchema(r.target),field=JSON.parse(text).fields[0];
  expect(field.type==='null'||Array.isArray(field.type)&&field.type.includes('null')).toBe(c.allowsNull);expect(field).not.toHaveProperty('default');expect(field.doc).toBe(c.author.target.modules[0]!.elements[0]!.description);
  if(c.label==='unspecified')expect(r.mapping.basis).toBe('no-authored-requirement');
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverNullabilityFromAvro(back,text)).toEqual(c.author.target);}
 }
},60000);
test('null-only required, unbound absence and unprojected exactness cannot pass strict mode',()=>{
 const cases=avroNullabilityProjectionCases();
 expect(projectNullabilityToAvro(cases[0]!.author,cases[0]!.request).status).toBe('blocked');
 for(const c of cases.filter(c=>c.variant==='exactness')){const r=projectNullabilityToAvro(c.author,c.request);expect(r.residuals.some(x=>x.path.endsWith('/exactness'))).toBe(true);expect(r.status).toBe(c.request.mode==='strict'?'blocked':'projected');}
 const last=cases.at(-1)!,r=projectNullabilityToAvro(last.author,last.request);expect(r.mapping.basis).toBe('unprojected-requirement');expect(r.mapping.outcome).toBe('not-expressible');
});
test('native changes, forged source/meaning and invalid Avro names refuse',()=>{
 const c=avroNullabilityProjectionCases().find(c=>c.nativeType==='int'&&c.label==='required')!,r=projectNullabilityToAvro(c.author,c.request),text=exportAvroSchema(r.target!);
 expect(()=>recoverNullabilityFromAvro(r,text+' ')).toThrow();
 for(const alter of [(v:typeof r)=>{v.mapping.encoding='null-only';},(v:typeof r)=>{v.source.future=true;},(v:typeof r)=>{v.mapping.scope='reader-resolution';},(v:typeof r)=>{v.target!.future=true;}]){const forged=structuredClone(r);alter(forged);expect(()=>recoverNullabilityFromAvro(forged,text)).toThrow();}
 const author=structuredClone(c.author);author.target.future=true;expect(()=>projectNullabilityToAvro(author,c.request)).toThrow();
 for(const bad of ['','bad-name','bad\n','9start','雪'])for(const key of ['recordName','fieldName'] as const)expect(()=>projectNullabilityToAvro(c.author,{...c.request,[key]:bad})).toThrow();
});
test('unmapped document, module, relationship and extension meaning remains recoverable',async()=>{
 const c=avroNullabilityProjectionCases().find(c=>c.nativeType==='int'&&c.label==='required')!,source=structuredClone(c.author.source);
 source.future={consumer:'forms'};source.vocabularies.future={version:'1.0.0'};
 source.modules[0]!.extensions={future:{meaning:'module context'}};
 source.modules.push({id:'other',namespace:'other',elements:[{id:'x',extensions:{}}]});
 source.modules[0]!.elements[0]!.extensions.future={availability:'unknown',nested:[null,true]};
 source.modules[0]!.elements[0]!.references=[{role:'future',module:'other',element:'x'}];
 const {declareCoreNullability}=await import('../../src/model/nullability');
 const author=declareCoreNullability(source,{module:'m',element:'e'},'required');expect(projectNullabilityToAvro(author,c.request).status).toBe('blocked');
 const report=projectNullabilityToAvro(author,{...c.request,mode:'report'});expect(report.status).toBe('projected');
 for(const path of ['/future','/vocabularies','/modules/0/extensions','/modules/1','/modules/0/elements/0/extensions','/modules/0/elements/0/references'])expect(report.residuals.map(r=>r.path)).toContain(path);
 expect(recoverNullabilityFromAvro(report,exportAvroSchema(report.target!))).toEqual(author.target);
});
