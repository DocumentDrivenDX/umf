import {test,expect} from 'bun:test';
import {nullabilityTableSpecAuthor,nullabilityTableSpecProjectionCases} from '../../scripts/core-ideals/nullability-tablespec-projection-cases';
import {projectNullabilityToTableSpec,recoverNullabilityFromTableSpec,exportTableSpec,readJsonValue,writeJsonValue,copyJson,declareCoreNullability,importTableSpec,upgradeFieldEnvelope,classifyTableSpecField,upgradeNullabilityEnvelope,classifyTableSpecNullability} from '../../src';
import type {NullabilityTableSpecRequest} from '../../src';
const request:NullabilityTableSpecRequest={id:'target',tableName:'Orders',columnName:'value',nativeType:'VARCHAR',mode:'strict',profile:'runtime-model',context:null,carrier:'null-value'};
test('authored availability projects under explicit profiles with atomic strict/report loss and exact ideal recovery',()=>{
 for(const c of nullabilityTableSpecProjectionCases()){
  const before=structuredClone(c.author),r=projectNullabilityToTableSpec(c.author,c.request);expect(r.status).toBe(c.status as typeof r.status);expect(r.mapping.encoding).toBe(c.encoding as typeof r.mapping.encoding);expect(c.author).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const text=exportTableSpec(r.target!),native=JSON.parse(text).columns[0];
  if(c.encoding==='omitted')expect(Object.hasOwn(native,'nullable')).toBe(false);
  else expect(native.nullable).toEqual(c.request.context===null?c.ideal==='absent-allowed':{[c.request.context]:c.ideal==='absent-allowed'});
  expect(r.profileNotes.length).toBe(c.encoding==='boolean'?1:0);
  if(c.variant==='loss'){expect(r.residuals.some(x=>x.path.endsWith('/namespace'))).toBe(true);expect(r.residuals.some(x=>x.path.endsWith('/extensions'))).toBe(true);}
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverNullabilityFromTableSpec(receipt,text)).toEqual(c.author.target);}
  const fields=classifyTableSpecField(upgradeFieldEnvelope(importTableSpec(text,{id:'reimported',format:'json'})).target,{column:0,mode:'strict'}).target!;
  const observed=classifyTableSpecNullability(upgradeNullabilityEnvelope(fields).target,{column:0,mode:'report',profile:c.request.profile,context:c.request.context,carrier:c.request.carrier});
  expect(observed.mapping.nullability).toBe(c.encoding==='omitted'?'unspecified':c.ideal);
 }
},60000);
test('names, unknown obligations, scalar mismatches and unsafe or forged inputs cannot silently succeed',()=>{
 const author=nullabilityTableSpecAuthor(),r=projectNullabilityToTableSpec(author,request),text=exportTableSpec(r.target!);
 for(const changed of [{columnName:'different'},{nativeType:'INTEGER' as const}]){expect(projectNullabilityToTableSpec(author,{...request,...changed}).status).toBe('blocked');expect(projectNullabilityToTableSpec(author,{...request,...changed,mode:'report'}).residuals.length).toBeGreaterThan(0);}
 for(const name of ['bad name','_bad','1bad','x'.repeat(129)])expect(()=>projectNullabilityToTableSpec(author,{...request,columnName:name})).toThrow();
 const badAuthor=structuredClone(author);badAuthor.target.future=true;expect(()=>projectNullabilityToTableSpec(badAuthor,request)).toThrow();
 for(const change of [(x:typeof r)=>{x.profileNotes=[];},(x:typeof r)=>{x.mapping.encoding='omitted';},(x:typeof r)=>{x.residuals.push({path:'/fake',value:true,reason:'fake',outcome:'unknown',recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});},(x:typeof r)=>{delete (x as unknown as {diagnostics?:unknown}).diagnostics;},(x:typeof r)=>{x.source.future=true;}]){const forged=structuredClone(r);change(forged);expect(()=>recoverNullabilityFromTableSpec(forged,text)).toThrow();}
 expect(()=>recoverNullabilityFromTableSpec(r,text+' ')).toThrow();
 let invoked=false;const unsafe=Object.defineProperty({},'id',{enumerable:true,get(){invoked=true;return 'x';}});expect(()=>projectNullabilityToTableSpec(author,unsafe as NullabilityTableSpecRequest)).toThrow();expect(invoked).toBe(false);
});
test('context keys are exact data and other elements/modules remain explicit residuals',()=>{
 const author=nullabilityTableSpecAuthor();for(const context of ['__proto__','EU/~','雪']){const r=projectNullabilityToTableSpec(author,{...request,profile:'checked-schema',context});const native=JSON.parse(exportTableSpec(r.target!));expect(Object.hasOwn(native.columns[0].nullable,context)).toBe(true);expect(native.columns[0].nullable[context]).toBe(false);expect(recoverNullabilityFromTableSpec(r,exportTableSpec(r.target!))).toEqual(author.target);}
 const source=structuredClone(author.source);source.future={keep:true};source.modules[0]!.elements.push({id:'other',kind:'field',extensions:{}});source.modules.push({id:'other',namespace:'billing',elements:[]});const extended=declareCoreNullability(source,author.identity,'required'),r=projectNullabilityToTableSpec(extended,{...request,mode:'report'});
 expect(r.residuals.map(x=>x.path)).toEqual(['/future','/modules/0/elements/1','/modules/1']);expect(recoverNullabilityFromTableSpec(r,exportTableSpec(r.target!))).toEqual(extended.target);
});
