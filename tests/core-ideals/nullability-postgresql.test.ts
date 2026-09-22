import {test,expect} from 'bun:test';
import {postgresqlAvailabilitySource,postgresqlNullabilityCases} from '../../scripts/core-ideals/nullability-postgresql-cases';
import {classifyPostgresqlNullability,verifyPostgresqlNullabilityClassification,recoverPostgresqlNullabilitySource,postgresqlNullabilityPackage,POSTGRESQL_NULLABILITY_EXTENSION,declareCoreNullability,copyJson,readJsonValue,writeJsonValue,Registry,validateDocument} from '../../src';
import type {PostgresqlNullabilityRequest} from '../../src';
const fixture=await Bun.file('fixtures/validation/nullability-postgresql-native.json').json(),text:string=fixture.nativeSource;
const base={scope:'stored-relation',carrier:'sql-null',mode:'strict'} as const;
test('native catalog availability matrix retains source and scope through both serializations',()=>{
 for(const c of postgresqlNullabilityCases(text)){
  const before=structuredClone(c.source),r=classifyPostgresqlNullability(c.source,c.request);
  expect(r.status).toBe(c.status);expect(r.mapping.nullability).toBe(c.expected);expect(c.source).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const member=r.target!.modules.find(m=>m.id==='postgresql.columns')!.elements.find(e=>e.id===c.request.column)!;
  expect(member.nullability).toBe(c.expected);expect(member.extensions[POSTGRESQL_NULLABILITY_EXTENSION]).toMatchObject({scope:c.request.scope,carrier:c.request.carrier});
  expect(validateDocument(r.target!,new Registry().register(postgresqlNullabilityPackage)).valid).toBe(true);
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverPostgresqlNullabilitySource(back,back.target!)).toBe(text);}
 }
},120000);
test('domain NOT NULL, CHECK UNKNOWN, NOT VALID and generated expressions do not become column permission',()=>{
 for(const relation of ['domain_required','positive','checked_required','unvalidated','generated_value']){
  const {source,column}=postgresqlAvailabilitySource(text,relation);
  const r=classifyPostgresqlNullability(source,{...base,column,nativeSource:text,mode:'report'});
  expect(r.mapping.nullability).toBe('unspecified');expect(r.residuals.length).toBeGreaterThan(0);expect(r.target).toBeDefined();
 }
});
test('author conflicts, stale and forged receipts, unknown extensions and altered archives',()=>{
 const {source,column}=postgresqlAvailabilitySource(text,'required'),request={...base,column,nativeSource:text};
 const identity={module:'postgresql.columns',element:column};
 const author=declareCoreNullability(source,identity,'required');
 expect(classifyPostgresqlNullability(author.target,{...request,author}).status).toBe('classified');
 expect(classifyPostgresqlNullability(author.target,request).status).toBe('blocked');
 const other=declareCoreNullability(source,identity,'absent-allowed');
 for(const mode of ['strict','report'] as const)expect(classifyPostgresqlNullability(other.target,{...request,author:other,mode}).status).toBe('blocked');
 const r=classifyPostgresqlNullability(source,request);
 for(const change of [(v:typeof r)=>{v.mapping.nullability='absent-allowed';},(v:typeof r)=>{v.mapping.scope='query-result';},(v:typeof r)=>{v.mapping.nativeFragment={kind:'null'};},(v:typeof r)=>{v.diagnostics.push({code:'forged',severity:'warning',path:'',message:'fake'});}]){const forged=structuredClone(r);change(forged);expect(()=>verifyPostgresqlNullabilityClassification(forged,forged.target!)).toThrow();}
 const stale=structuredClone(r.target!);stale.future=true;expect(()=>verifyPostgresqlNullabilityClassification(r,stale)).toThrow();
 expect(classifyPostgresqlNullability(r.target!,request).status).toBe('blocked');
 const opaque=structuredClone(source);opaque.vocabularies.future={version:'1.0.0'};opaque.modules[0]!.extensions={future:{nested:[1,null,'keep']}};
 const retained=classifyPostgresqlNullability(opaque,request);expect(retained.target!.modules[0]!.extensions!.future).toEqual(opaque.modules[0]!.extensions!.future);
 const invalid=structuredClone(retained.target!);delete (invalid.modules.find(m=>m.id===identity.module)!.elements.find(e=>e.id===column)!.extensions[POSTGRESQL_NULLABILITY_EXTENSION] as Record<string,unknown>).scope;
 expect(validateDocument(invalid,new Registry().register(postgresqlNullabilityPackage)).valid).toBe(false);
 expect(()=>classifyPostgresqlNullability(source,{...request,nativeSource:'{}'})).toThrow();
 let called=false;const unsafe=Object.defineProperty({},'column',{enumerable:true,get(){called=true;return column;}});expect(()=>classifyPostgresqlNullability(source,unsafe as PostgresqlNullabilityRequest)).toThrow();expect(called).toBe(false);
});
test('unknown exact native content remains recoverable while uncertain permission is withheld',()=>{
 const unknown=text.replace('"notNull": false','"future": 9007199254740993, "notNull": false');
 const {source,column}=postgresqlAvailabilitySource(unknown,'plain');
 const r=classifyPostgresqlNullability(source,{...base,column,nativeSource:unknown,mode:'report'});
 expect(recoverPostgresqlNullabilitySource(r,r.target!)).toBe(unknown);
 const capture=JSON.parse(text);const relation=capture.snapshot.relations.find((r:any)=>r.name==='plain');relation.columns[0].future={availability:'unknown'};
 const modified=JSON.stringify(capture),changed=postgresqlAvailabilitySource(modified,'plain');
 expect(classifyPostgresqlNullability(changed.source,{...base,column:changed.column,nativeSource:modified,mode:'report'}).mapping.nullability).toBe('unspecified');
});
test('missing flags, triggers, unsupported profiles and source state remain explicit',()=>{
 for(const alter of [
  (c:any)=>{delete c.snapshot.relations.find((r:any)=>r.name==='plain').columns[0].notNull;},
  (c:any)=>{c.snapshot.relations.find((r:any)=>r.name==='plain').columns[0].notNull='false';},
  (c:any)=>{delete c.snapshot.triggers;},
 ]){
  const capture=JSON.parse(text);alter(capture);
  expect(()=>postgresqlAvailabilitySource(JSON.stringify(capture),'plain')).toThrow();
 }
 const capture=JSON.parse(text);capture.snapshot.triggers=[{schema:'availability',relation:'plain',name:'unknown',enabled:'D',definition:'unknown',function:'unknown',deferrable:false,deferred:false,comment:null}];
 const nativeSource=JSON.stringify(capture),triggered=postgresqlAvailabilitySource(nativeSource,'plain');
 expect(classifyPostgresqlNullability(triggered.source,{...base,column:triggered.column,nativeSource}).status).toBe('blocked');
 const report=classifyPostgresqlNullability(triggered.source,{...base,column:triggered.column,nativeSource,mode:'report'});expect(report.mapping.nullability).toBe('unspecified');expect(recoverPostgresqlNullabilitySource(report,report.target!)).toBe(nativeSource);
 const {source,column}=postgresqlAvailabilitySource(text,'plain');
 const modified=structuredClone(source);(modified.modules[0]!.elements[0]!.extensions['umf.postgresql.catalog'] as Record<string,unknown>).state='modified';
 expect(()=>classifyPostgresqlNullability(modified,{...base,column,nativeSource:text})).toThrow();
 for(const version of ['0.1.0','0.2.0'] as const){const legacy=structuredClone(source);legacy.umf=version;expect(()=>classifyPostgresqlNullability(legacy,{...base,column,nativeSource:text})).toThrow();}
 const incompatible=structuredClone(source);incompatible.vocabularies[POSTGRESQL_NULLABILITY_EXTENSION]={version:'2.0.0'};
 expect(classifyPostgresqlNullability(incompatible,{...base,column,nativeSource:text,mode:'report'}).status).toBe('blocked');
 const noField=structuredClone(source);delete noField.modules.find(m=>m.id==='postgresql.columns')!.elements.find(e=>e.id===column)!.kind;
 expect(classifyPostgresqlNullability(noField,{...base,column,nativeSource:text,mode:'report'}).status).toBe('blocked');
});
