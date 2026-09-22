import {test,expect} from 'bun:test';
import {parquetNullabilityProjectionCases} from '../../scripts/core-ideals/nullability-parquet-projection-cases';
import {projectNullabilityToParquet,recoverNullabilityFromParquet} from '../../src/core-ideals/nullability-parquet-projection';
import {exportParquetCapture} from '../../src/adapters/parquet';
import {getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
test('authored Parquet availability emits explicit leaf repetition and recovers all ideals/residuals',()=>{
 for(const c of parquetNullabilityProjectionCases()){
  const before=structuredClone(c.author),r=projectNullabilityToParquet(c.author,c.request);expect(r.status).toBe(c.status);expect(c.author).toEqual(before);
  if(!r.target){expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const bytes=exportParquetCapture(r.target),field=getParquetFieldMetadata(r.target).fields[0]!;
  expect(field.definitionLevel).toBe(c.required?0:1);expect(field.repetitionLevel).toBe(0);expect(field.element.name).toBe(c.request.fieldName);
  if(c.label==='unspecified'){expect(r.mapping.encoding).toBe('optional');expect(r.mapping.basis).toBe('no-authored-requirement');}
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverNullabilityFromParquet(back,bytes)).toEqual(c.author.target);}
 }
},120000);
test('scope, cardinality, defaults and precision obligations remain explicit losses',()=>{
 for(const c of parquetNullabilityProjectionCases().filter(c=>['exactness','cardinality','default','description'].includes(c.variant))){const r=projectNullabilityToParquet(c.author,c.request);expect(r.residuals.length).toBeGreaterThan(0);expect(r.status).toBe(c.request.mode==='strict'?'blocked':'projected');}
 const c=parquetNullabilityProjectionCases().find(c=>c.variant==='scope'&&c.label==='required'&&c.request.mode==='report')!,r=projectNullabilityToParquet(c.author,c.request);expect(r.mapping.basis).toBe('unprojected-requirement');expect(r.mapping.outcome).toBe('not-expressible');
});
test('changed bytes, forged receipts, stale authors and invalid native names refuse',()=>{
 const c=parquetNullabilityProjectionCases()[0]!,r=projectNullabilityToParquet(c.author,c.request),bytes=exportParquetCapture(r.target!),changed=bytes.slice();changed[0]=0;expect(()=>recoverNullabilityFromParquet(r,changed)).toThrow();
 for(const alter of [(v:typeof r)=>{v.mapping.encoding='optional';},(v:typeof r)=>{v.source.future=true;},(v:typeof r)=>{v.mapping.scope='write-input';},(v:typeof r)=>{v.target!.future=true;}]){const forged=structuredClone(r);alter(forged);expect(()=>recoverNullabilityFromParquet(forged,bytes)).toThrow();}
 const author=structuredClone(c.author);author.target.future=true;expect(()=>projectNullabilityToParquet(author,c.request)).toThrow();
 for(const name of ['','bad\0name','\ud800'])for(const key of ['recordName','fieldName'] as const)expect(()=>projectNullabilityToParquet(c.author,{...c.request,[key]:name})).toThrow();
});
test('document/module metadata and relationships survive report-mode ideal recovery',async()=>{
 const c=parquetNullabilityProjectionCases()[0]!,source=structuredClone(c.author.source);source.future={consumer:'forms'};source.vocabularies.future={version:'1.0.0'};source.modules[0]!.extensions={future:{meaning:'module context'}};source.modules.push({id:'other',namespace:'other',elements:[{id:'x',extensions:{}}]});source.modules[0]!.elements[0]!.extensions.future={nested:[null,true]};source.modules[0]!.elements[0]!.references=[{role:'future',module:'other',element:'x'}];
 const {declareCoreNullability}=await import('../../src/model/nullability');const author=declareCoreNullability(source,{module:'m',element:'e'},'required');expect(projectNullabilityToParquet(author,c.request).status).toBe('blocked');const report=projectNullabilityToParquet(author,{...c.request,mode:'report'});expect(report.status).toBe('projected');
 for(const path of ['/future','/vocabularies','/modules/0/extensions','/modules/1','/modules/0/elements/0/extensions','/modules/0/elements/0/references'])expect(report.residuals.map(r=>r.path)).toContain(path);
 expect(recoverNullabilityFromParquet(report,exportParquetCapture(report.target!))).toEqual(author.target);
});
