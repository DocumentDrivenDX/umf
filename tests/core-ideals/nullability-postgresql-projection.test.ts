import {test,expect} from 'bun:test';
import {postgresqlNullabilityProjectionCases} from '../../scripts/core-ideals/nullability-postgresql-projection-cases';
import {projectNullabilityToPostgresql,recoverNullabilityFromPostgresql} from '../../src/core-ideals/nullability-postgresql-projection';
import {backend} from '../../native/postgresql/runtime';
import {getPostgresqlSource} from '../../src/adapters/postgresql';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
test('authored availability projects with explicit scope and recovers every residual through both formats',async()=>{
 for(const c of postgresqlNullabilityProjectionCases()){
  const before=structuredClone(c.author),r=await projectNullabilityToPostgresql(c.author,c.request,backend);
  expect(r.status).toBe(c.status);expect(c.author).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.nativeSql).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  expect(getPostgresqlSource(r.target!)).toBe(r.nativeSql!);
  expect(r.nativeSql!.includes(' NOT NULL')).toBe(c.expectedNotNull);
  if(c.label==='unspecified')expect(r.mapping.encoding).toBe('omitted');
  if(r.residuals.length)expect(r.diagnostics.every(d=>d.severity==='warning')).toBe(true);
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(await recoverNullabilityFromPostgresql(back,r.nativeSql!,backend)).toEqual(c.author.target);}
 }
},60000);
test('stale SQL, forged receipts and source changes cannot recover author meaning',async()=>{
 const c=postgresqlNullabilityProjectionCases()[0]!,r=await projectNullabilityToPostgresql(c.author,c.request,backend);
 await expect(recoverNullabilityFromPostgresql(r,r.nativeSql!+' ',backend)).rejects.toThrow();
 for(const alter of [(v:typeof r)=>{v.mapping.encoding='null';},(v:typeof r)=>{v.source.future=true;},(v:typeof r)=>{v.residuals=[];v.mapping.scope='query-result';},(v:typeof r)=>{v.diagnostics.push({code:'forged',path:'',message:'fake',severity:'warning'});}]){const forged=structuredClone(r);alter(forged);await expect(recoverNullabilityFromPostgresql(forged,r.nativeSql!,backend)).rejects.toThrow();}
 const author=structuredClone(c.author);author.target.future=true;await expect(projectNullabilityToPostgresql(author,c.request,backend)).rejects.toThrow();
});
test('identifiers cannot be truncated and strict loss does not invoke the parser',async()=>{
 const c=postgresqlNullabilityProjectionCases()[0]!;
 for(const value of ['', 'x\0y','\ud800','雪'.repeat(22),'x'.repeat(64)])for(const key of ['namespace','tableName','columnName'] as const)await expect(projectNullabilityToPostgresql(c.author,{...c.request,[key]:value},backend)).rejects.toThrow();
 const loss=postgresqlNullabilityProjectionCases().find(c=>c.variant==='unknown'&&c.request.mode==='strict')!;
 let called=false;const guarded={...backend,parse:async()=>{called=true;throw Error('Must not parse');}};
 expect((await projectNullabilityToPostgresql(loss.author,loss.request,guarded)).status).toBe('blocked');expect(called).toBe(false);
});
test('programmatic metadata and unknown extension obligations survive report recovery',async()=>{
 const c=postgresqlNullabilityProjectionCases()[0]!,source=structuredClone(c.author.source);
 source.future={consumer:'forms'};source.vocabularies.future={version:'1.0.0'};
 source.modules[0]!.extensions={future:{meaning:'keep module context'}};
 source.modules.push({id:'other',namespace:'other',elements:[{id:'x',extensions:{}}]});
 source.modules[0]!.elements[0]!.extensions.future={minimumAvailability:'unknown',nested:[null,true]};
 source.modules[0]!.elements[0]!.references=[{role:'future',module:'other',element:'x'}];
 const {declareCoreNullability}=await import('../../src/model/nullability');
 const author=declareCoreNullability(source,{module:'m',element:'e'},'required');
 expect((await projectNullabilityToPostgresql(author,c.request,backend)).status).toBe('blocked');
 const report=await projectNullabilityToPostgresql(author,{...c.request,mode:'report'},backend);
 expect(report.status).toBe('projected');
 const paths=report.residuals.map(r=>r.path);
 for(const path of ['/future','/vocabularies','/modules/0/extensions','/modules/1','/modules/0/elements/0/extensions','/modules/0/elements/0/references'])expect(paths).toContain(path);
 expect(await recoverNullabilityFromPostgresql(report,report.nativeSql!,backend)).toEqual(author.target);
});
