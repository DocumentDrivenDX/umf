import {test,expect} from 'bun:test';
import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata,upgradeFieldEnvelope,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,readJsonValue,writeJsonValue,copyJson,declareCoreCardinality} from '../../src';
import {classifyPostgresqlCardinality,recoverPostgresqlCardinalitySource,verifyPostgresqlCardinalityClassification} from '../../src/core-ideals/cardinality-postgresql';
const fixture=await Bun.file('fixtures/validation/cardinality-postgresql-catalog-native.json').json();
function input(){const source=upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importPostgresqlCatalogCapture(fixture.captureSource,{id:'classification'})).target).target).target;for(const e of source.modules.find(m=>m.id==='postgresql.columns')!.elements)e.kind='field';return source;}
test('all observed native shapes retain paired archives through report classification and serialized recovery',()=>{
 for(const c of getPostgresqlColumnMetadata(input())){
  const source=input(),request={column:c.path,nativeSource:fixture.captureSource,supplement:JSON.stringify(fixture.supplement),mode:'report' as const,profile:'stored-value' as const};
  const before=structuredClone(source),r=classifyPostgresqlCardinality(source,request);expect(source).toEqual(before);expect(r.status).toBe('classified');
  const array=['declared','sequence','domains'].includes(c.relation.name);expect(r.mapping.cardinality).toBe(array?'array':c.relation.name==='scalars'?'one':'unspecified');expect(r.residuals.length===0).toBe(c.relation.name==='scalars');
  expect(classifyPostgresqlCardinality(source,{...request,mode:'strict'}).status).toBe(c.relation.name==='scalars'?'classified':'blocked');
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverPostgresqlCardinalitySource(saved,saved.target!)).toEqual({nativeSource:request.nativeSource,supplement:request.supplement});}
 }
},120000);
test('author conflict and forged or stale recovery receipts are refused',()=>{
 const source=input(),column=getPostgresqlColumnMetadata(source)[0]!.path;
 const request={column,nativeSource:fixture.captureSource,supplement:JSON.stringify(fixture.supplement),mode:'report' as const,profile:'stored-value' as const};
 const author=declareCoreCardinality(source,{module:'postgresql.columns',element:column},{cardinality:'one'});
 expect(classifyPostgresqlCardinality(author.target,{...request,author}).status).toBe('blocked');
 const r=classifyPostgresqlCardinality(source,request),forged=structuredClone(r);forged.residuals=[];
 expect(()=>verifyPostgresqlCardinalityClassification(forged,r.target!)).toThrow();
 const stale=structuredClone(r.target!);stale.future=true;expect(()=>recoverPostgresqlCardinalitySource(r,stale)).toThrow();
 expect(()=>classifyPostgresqlCardinality(source,{...request,nativeSource:'{}'})).toThrow();
});
test('a matched basic scalar declaration classifies exactly without asserting item or availability meaning',()=>{
 const capture=JSON.parse(fixture.captureSource),supplement=structuredClone(fixture.supplement);
 const relation=capture.snapshot.relations.find((r:any)=>r.name==='json_values'),column=relation.columns[0];
 column.type='integer';column.nativeType={schema:'pg_catalog',name:'int4',kind:'b',category:'N',dimensions:0,modifier:-1};
 supplement.columns.find((c:any)=>c.relation==='json_values').type={schema:'pg_catalog',name:'int4'};
 const nativeSource=JSON.stringify(capture);
 const source=upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'scalar-unit'})).target).target).target;
 const selected=getPostgresqlColumnMetadata(source).find(c=>c.relation.name==='json_values')!;
 source.modules.find(m=>m.id==='postgresql.columns')!.elements.find(e=>e.id===selected.path)!.kind='field';
 const r=classifyPostgresqlCardinality(source,{column:selected.path,nativeSource,supplement:JSON.stringify(supplement),mode:'strict',profile:'stored-value'});
 expect(r.status).toBe('classified');expect(r.mapping.cardinality).toBe('one');expect(r.mapping.outcome).toBe('exact');expect(r.residuals).toHaveLength(0);
 expect(recoverPostgresqlCardinalitySource(r,r.target!).nativeSource).toBe(nativeSource);
});
