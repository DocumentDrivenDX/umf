import {test,expect} from 'bun:test';
import {sqlserverAvailabilitySource,sqlserverNullabilityCases} from '../../scripts/core-ideals/nullability-sqlserver-cases';
import {classifySqlServerNullability,verifySqlServerNullabilityClassification,recoverSqlServerNullabilitySource,sqlserverNullabilityPackage,SQLSERVER_NULLABILITY_EXTENSION,declareCoreNullability,copyJson,readJsonValue,writeJsonValue,Registry,validateDocument} from '../../src';
import type {SqlServerNullabilityRequest} from '../../src';
const fixture=await Bun.file('fixtures/validation/nullability-sqlserver-native.json').json(),text:string=fixture.nativeSource;
const base={scope:'stored-relation',carrier:'sql-null',mode:'strict'} as const;
test('native catalog availability matrix retains source and scope through both serializations',()=>{
 for(const c of sqlserverNullabilityCases(text)){
  const before=structuredClone(c.source),r=classifySqlServerNullability(c.source,c.request);
  expect(r.status).toBe(c.status);expect(r.mapping.nullability).toBe(c.expected);expect(c.source).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const member=r.target!.modules.find(m=>m.id==='sqlserver.columns')!.elements.find(e=>e.id===c.request.column)!;
  expect(member.nullability).toBe(c.expected);expect(member.extensions[SQLSERVER_NULLABILITY_EXTENSION]).toMatchObject({scope:c.request.scope,carrier:c.request.carrier});
  expect(validateDocument(r.target!,new Registry().register(sqlserverNullabilityPackage)).valid).toBe(true);
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverSqlServerNullabilitySource(back,back.target!)).toBe(text);}
 }
},240000);
test('CHECK UNKNOWN and untrusted constraints do not become unconditional permission',()=>{
 for(const relation of ['positive','checked_required','untrusted']){
  const {source,column}=sqlserverAvailabilitySource(text,relation);
  const r=classifySqlServerNullability(source,{...base,column,nativeSource:text,mode:'report'});
  expect(r.mapping.nullability).toBe('unspecified');expect(r.residuals.length).toBeGreaterThan(0);expect(r.target).toBeDefined();
 }
});
test('author conflicts, stale and forged receipts, unknown extensions and altered archives',()=>{
 const {source,column}=sqlserverAvailabilitySource(text,'required'),request={...base,column,nativeSource:text};
 const identity={module:'sqlserver.columns',element:column};
 const author=declareCoreNullability(source,identity,'required');
 expect(classifySqlServerNullability(author.target,{...request,author}).status).toBe('classified');
 expect(classifySqlServerNullability(author.target,request).status).toBe('blocked');
 const other=declareCoreNullability(source,identity,'absent-allowed');
 for(const mode of ['strict','report'] as const)expect(classifySqlServerNullability(other.target,{...request,author:other,mode}).status).toBe('blocked');
 const r=classifySqlServerNullability(source,request);
 for(const change of [(v:typeof r)=>{v.mapping.nullability='absent-allowed';},(v:typeof r)=>{v.mapping.scope='query-result';},(v:typeof r)=>{v.mapping.nativeFragment={kind:'null'};},(v:typeof r)=>{v.diagnostics.push({code:'forged',severity:'warning',path:'',message:'fake'});}]){const forged=structuredClone(r);change(forged);expect(()=>verifySqlServerNullabilityClassification(forged,forged.target!)).toThrow();}
 const stale=structuredClone(r.target!);stale.future=true;expect(()=>verifySqlServerNullabilityClassification(r,stale)).toThrow();
 expect(classifySqlServerNullability(r.target!,request).status).toBe('blocked');
 const opaque=structuredClone(source);opaque.vocabularies.future={version:'1.0.0'};opaque.modules[0]!.extensions={future:{nested:[1,null,'keep']}};
 const retained=classifySqlServerNullability(opaque,request);expect(retained.target!.modules[0]!.extensions!.future).toEqual(opaque.modules[0]!.extensions!.future);
 const invalid=structuredClone(retained.target!);delete (invalid.modules.find(m=>m.id===identity.module)!.elements.find(e=>e.id===column)!.extensions[SQLSERVER_NULLABILITY_EXTENSION] as Record<string,unknown>).scope;
 expect(validateDocument(invalid,new Registry().register(sqlserverNullabilityPackage)).valid).toBe(false);
 expect(()=>classifySqlServerNullability(source,{...request,nativeSource:'{}'})).toThrow();
 let called=false;const unsafe=Object.defineProperty({},'column',{enumerable:true,get(){called=true;return column;}});expect(()=>classifySqlServerNullability(source,unsafe as SqlServerNullabilityRequest)).toThrow();expect(called).toBe(false);
});
test('unknown native fields, legacy evidence and rules retain residuals with exact source recovery',()=>{
 const mutations=[
  (c:any)=>{delete c.availabilityEvidence;},
  (c:any)=>{c.availabilityEvidence.database_view_definition=false;},
  (c:any)=>{c.availabilityEvidence.profile='umf-sqlserver-nullability-evidence-v1';},
  (c:any)=>{c.availabilityEvidence.column_refinements.find((r:any)=>r.table==='plain').rule_object_id=7;},
  (c:any)=>{c.availabilityEvidence.column_refinements.find((r:any)=>r.table==='plain').future=true;},
  (c:any)=>{c.tables.find((t:any)=>t.name==='plain').columns[0].future={availability:'unknown'};},
  (c:any)=>{c.availabilityEvidence.column_refinements.push(c.availabilityEvidence.column_refinements.find((r:any)=>r.table==='plain'));},
  (c:any)=>{c.availabilityEvidence.triggers.push({schema:'availability',table:'plain',name:'unknown',is_disabled:true,is_instead_of_trigger:false,definition:null});},
 ];
 for(const change of mutations){
  const capture=JSON.parse(text);change(capture);const nativeSource=JSON.stringify(capture),{source,column}=sqlserverAvailabilitySource(nativeSource,'plain');
  expect(classifySqlServerNullability(source,{...base,column,nativeSource}).status).toBe('blocked');
  const report=classifySqlServerNullability(source,{...base,column,nativeSource,mode:'report'});
  expect(report.mapping.nullability).toBe('unspecified');expect(recoverSqlServerNullabilitySource(report,report.target!)).toBe(nativeSource);
 }
 const unknown=text.replace('"profile": "sqlserver-catalog-v3"','"future": 9007199254740993, "profile": "sqlserver-catalog-v3"');
 const {source,column}=sqlserverAvailabilitySource(unknown,'required');
 const r=classifySqlServerNullability(source,{...base,column,nativeSource:unknown});
 expect(recoverSqlServerNullabilitySource(r,r.target!)).toBe(unknown);
},30000);
test('modified captures, incorrect envelope versions and unsafe numeric refinements refuse interpretation',()=>{
 for(const change of [(c:any)=>{c.state='modified';},(c:any)=>{c.profile='sqlserver-catalog-v1';}]){
  const c=JSON.parse(text);change(c);const nativeSource=JSON.stringify(c),{source,column}=sqlserverAvailabilitySource(nativeSource,'plain');
  expect(()=>classifySqlServerNullability(source,{...base,column,nativeSource})).toThrow();
 }
 const {source,column}=sqlserverAvailabilitySource(text,'plain');
 for(const version of ['0.1.0','0.2.0'] as const){const legacy=structuredClone(source);legacy.umf=version;expect(()=>classifySqlServerNullability(legacy,{...base,column,nativeSource:text})).toThrow();}
 const capture=JSON.parse(text);capture.availabilityEvidence.column_refinements.find((r:any)=>r.table==='plain').generated_always_type='underflow';
 const nativeSource=JSON.stringify(capture).replace('"underflow"','1e-999'),changed=sqlserverAvailabilitySource(nativeSource,'plain');
 expect(classifySqlServerNullability(changed.source,{...base,column:changed.column,nativeSource,mode:'report'}).mapping.nullability).toBe('unspecified');
});
