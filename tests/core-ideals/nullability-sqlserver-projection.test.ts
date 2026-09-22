import {test,expect} from 'bun:test';
import {sqlserverNullabilityProjectionCases} from '../../scripts/core-ideals/nullability-sqlserver-projection-cases';
import {projectNullabilityToSqlServer,recoverNullabilityFromSqlServer} from '../../src/core-ideals/nullability-sqlserver-projection';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
test('authored availability projects with explicit scope and recovers every residual through both formats',async()=>{
 for(const c of sqlserverNullabilityProjectionCases()){
  const before=structuredClone(c.author),r=await projectNullabilityToSqlServer(c.author,c.request);
  expect(r.status).toBe(c.status);expect(c.author).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.nativeSql).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  expect(r.target!.sql).toBe(r.nativeSql!);
  expect(r.nativeSql!.includes(' NOT NULL')).toBe(c.expectedNotNull);
  if(c.label==='unspecified'){expect(r.mapping.encoding).toBe('null');expect(r.mapping.basis).toBe('no-authored-requirement');};
  if(r.residuals.length)expect(r.diagnostics.every(d=>d.severity==='warning')).toBe(true);
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(await recoverNullabilityFromSqlServer(back,r.nativeSql!)).toEqual(c.author.target);}
 }
},60000);
test('stale SQL, forged receipts and source changes cannot recover author meaning',async()=>{
 const c=sqlserverNullabilityProjectionCases()[0]!,r=await projectNullabilityToSqlServer(c.author,c.request);
 expect(()=>recoverNullabilityFromSqlServer(r,r.nativeSql!+' ')).toThrow();
 for(const alter of [(v:typeof r)=>{v.mapping.encoding='null';},(v:typeof r)=>{v.source.future=true;},(v:typeof r)=>{v.residuals=[];v.mapping.scope='query-result';},(v:typeof r)=>{v.diagnostics.push({code:'forged',path:'',message:'fake',severity:'warning'});}]){const forged=structuredClone(r);alter(forged);expect(()=>recoverNullabilityFromSqlServer(forged,r.nativeSql!)).toThrow();}
 const author=structuredClone(c.author);author.target.future=true;expect(()=>projectNullabilityToSqlServer(author,c.request)).toThrow();
});
test('invalid permanent identifiers refuse and native nullability is always explicit',()=>{
 const c=sqlserverNullabilityProjectionCases()[0]!;
 for(const value of ['', 'x\0y','\ud800','x'.repeat(129),'#temporary',' edge'])for(const key of ['namespace','tableName','columnName'] as const)expect(()=>projectNullabilityToSqlServer(c.author,{...c.request,[key]:value})).toThrow();
 for(const c of sqlserverNullabilityProjectionCases()){
  const r=projectNullabilityToSqlServer(c.author,c.request);
  if(r.nativeSql)expect(r.nativeSql.split('\n')[0]).toMatch(/ (?:NOT )?NULL\);$/);
 }
});
test('programmatic metadata and unknown extension obligations survive report recovery',async()=>{
 const c=sqlserverNullabilityProjectionCases()[0]!,source=structuredClone(c.author.source);
 source.future={consumer:'forms'};source.vocabularies.future={version:'1.0.0'};
 source.modules[0]!.extensions={future:{meaning:'keep module context'}};
 source.modules.push({id:'other',namespace:'other',elements:[{id:'x',extensions:{}}]});
 source.modules[0]!.elements[0]!.extensions.future={minimumAvailability:'unknown',nested:[null,true]};
 source.modules[0]!.elements[0]!.references=[{role:'future',module:'other',element:'x'}];
 const {declareCoreNullability}=await import('../../src/model/nullability');
 const author=declareCoreNullability(source,{module:'m',element:'e'},'required');
 expect((await projectNullabilityToSqlServer(author,c.request)).status).toBe('blocked');
 const report=await projectNullabilityToSqlServer(author,{...c.request,mode:'report'});
 expect(report.status).toBe('projected');
 const paths=report.residuals.map(r=>r.path);
 for(const path of ['/future','/vocabularies','/modules/0/extensions','/modules/1','/modules/0/elements/0/extensions','/modules/0/elements/0/references'])expect(paths).toContain(path);
 expect(await recoverNullabilityFromSqlServer(report,report.nativeSql!)).toEqual(author.target);
});
