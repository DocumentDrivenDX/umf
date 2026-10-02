import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {classifyPostgresqlRelationships,copyJson,getPostgresqlSource,importPostgresqlSql,projectRelationshipsToPostgresql,recoverPostgresqlRelationshipSource,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative,readDocument,writeDocument,Registry,postgresqlRelationshipsPackage} from '../../src';
import {postgresqlRelationshipCases} from '../../scripts/core-ideals/relationship-postgresql-cases';

// @covers US-045-AC4 @covers US-045-AC6 @covers US-045-AC7 @covers US-045-AC8
test('qualified PostgreSQL FK/junction projection matrix retains authored meaning in both modes',async()=>{
 for(const c of postgresqlRelationshipCases()){
  const before=copyJson(c),r=await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend);
  expect(r.status,c.id+JSON.stringify(r.diagnostics)).toBe(c.expected);expect(copyJson(c)).toEqual(before);
  expect(r.source).toEqual(c.source);expect(r.physicalBinding).toEqual(c.binding);
  const strict=await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,{...c.request,mode:'strict'},backend);expect(strict.status).toBe('blocked');expect(strict.nativeSql).toBeUndefined();
  if(r.status==='projected'){
   expect(r.nativeSql).toContain('FOREIGN KEY');expect(r.nativeSql).toContain('NOT DEFERRABLE');
   const fresh=await importPostgresqlSql(r.nativeSql!,backend,{id:'fresh'});
   expect(await recoverRelationshipPostgresqlIdeal(r,fresh,backend)).toEqual(c.source);expect(await recoverRelationshipPostgresqlNative(r,fresh,backend)).toBe(r.nativeSql!);
   const classified=await classifyPostgresqlRelationships(fresh,{profile:'raw-ddl',mode:'report',nativeSource:r.nativeSql!},backend);expect(classified.status).toBe('classified');expect(classified.observations.length).toBe(r.mappings.reduce((n,m)=>n+m.constraints.length,0));
   expect(classified.target!.modules.some(m=>Object.hasOwn(m,'relationships'))).toBe(false);expect(await recoverPostgresqlRelationshipSource(classified,classified.target!,backend)).toBe(r.nativeSql!);
  }else expect(r.target).toBeUndefined();
 }
},120000);
// @covers US-045-AC3 @covers US-045-AC7
test('raw native NOT VALID, MATCH and actions stay observations with exact unknown/context recovery',async()=>{
 const text=(await Bun.file('fixtures/relationship/postgresql-native/constraints.sql').text())+'\n-- unknown application comment retained\n';
 const source=await importPostgresqlSql(text,backend,{id:'native'});source.extensions={future:{opaque:'native context'}};source.vocabularies.future={version:'1.0.0'};
 const r=await classifyPostgresqlRelationships(source,{profile:'raw-ddl',mode:'report',nativeSource:text},backend);expect(r.observations).toHaveLength(2);expect(r.observations[0]!.validated).toBeNull();expect(r.observations[0]!.match).toBe('simple');
 for(const format of ['json','yaml'] as const){const current=readDocument(writeDocument(r.target!,format),format);expect(await recoverPostgresqlRelationshipSource(r,current,backend)).toBe(text);}
 expect((await classifyPostgresqlRelationships(source,{profile:'raw-ddl',mode:'strict',nativeSource:text},backend)).status).toBe('blocked');
 expect(new Registry().register(postgresqlRelationshipsPackage).get('umf.postgresql.relationships','1.0.0')).toBeDefined();
 const changed=copyJson(r) as unknown as typeof r;changed.observations[0]!.onDelete='cascade';await expect(recoverPostgresqlRelationshipSource(changed,r.target!,backend)).rejects.toThrow();
});
test('sequential declarations remain valid while stale endpoint components and native edits refuse',async()=>{
 const c=postgresqlRelationshipCases()[0]!;expect(c.authors[0]!.target.modules[0]!.relationships).toHaveLength(1);expect(c.source.modules[0]!.relationships).toHaveLength(2);
 const r=await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend);expect(r.status).toBe('projected');
 const altered=await importPostgresqlSql(r.nativeSql!+'\n-- edit',backend,{id:'changed'});await expect(recoverRelationshipPostgresqlIdeal(r,altered,backend)).rejects.toThrow();
 const field=c.source.modules[0]!.elements.find(e=>e.id==='field_Customer_id')!;field.description='changed since authoring';await expect(projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend)).rejects.toThrow();
});
test('public classification and projection do not invoke getters',async()=>{
 const c=postgresqlRelationshipCases()[0]!;let called=0;Object.defineProperty(c.request,'mode',{enumerable:true,get(){called++;return 'report';}});
 await expect(projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend)).rejects.toThrow();expect(called).toBe(0);
});

test('captured native FK actions, alternate UNIQUE candidates and exact unknown numbers survive classification',async()=>{
 const native=await Bun.file('fixtures/postgresql/relationships/native-counterexamples.catalog.json').text();
 const {importPostgresqlCatalogCapture}=await import('../../src');const archive=importPostgresqlCatalogCapture(native,{id:'catalog'});
 const r=await classifyPostgresqlRelationships(archive,{profile:'captured-catalog',mode:'report',nativeSource:native},backend);
 expect(r.observations.find(o=>o.name==='fk_alt')?.validated).toBe(false);expect(r.observations.find(o=>o.name==='fk_alt')?.targetKeyCandidates).toEqual(['parent_alt_key']);
 const actions=r.observations.find(o=>o.sourceTable==='rel.actions')!;expect(actions.onUpdate).toBe('cascade');expect(actions.onDelete).toBe('set-null');expect(actions.initiallyDeferred).toBe(true);
 expect(await recoverPostgresqlRelationshipSource(r,r.target!,backend)).toBe(native);expect(native).toContain('9007199254740993');
 const bad=native.replace('"validated": false','"validated": true'),badArchive=importPostgresqlCatalogCapture(bad,{id:'bad'});
 await expect(classifyPostgresqlRelationships(badArchive,{profile:'captured-catalog',mode:'report',nativeSource:bad},backend)).rejects.toThrow();
 const duplicate=copyJson(r) as unknown as typeof r;duplicate.target!.extensions!.future={changed:true};await expect(recoverPostgresqlRelationshipSource(duplicate,duplicate.target!,backend)).rejects.toThrow();
});
test('unqualified native target remains explicitly unresolved, never missing',async()=>{
 const sql='CREATE TABLE child(id integer REFERENCES parent(id));',source=await importPostgresqlSql(sql,backend,{id:'unqualified'});
 const r=await classifyPostgresqlRelationships(source,{profile:'raw-ddl',mode:'report',nativeSource:sql},backend);expect(r.observations[0]!.targetTable).toBeNull();expect(r.residuals.some(x=>x.reason.includes('unresolved, not absence'))).toBe(true);
});

test('anonymous junction system-column names refuse before native emission',async()=>{
 const c=postgresqlRelationshipCases().find(c=>c.id==='anonymous-junction')!;c.request.policy.relationshipLayouts[1]!.sourceComponents![0]!.carrierColumn='xmin';
 const r=await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend);expect(r.status).toBe('blocked');expect(r.nativeSql).toBeUndefined();expect(r.residuals.some(x=>x.reason.includes('system column'))).toBe(true);
});
