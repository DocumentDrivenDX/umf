import {test,expect} from 'bun:test';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,upgradeFieldEnvelope,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,readJsonValue,writeJsonValue,copyJson} from '../../src';
import {classifySqlServerCardinality,recoverSqlServerCardinalitySource} from '../../src/core-ideals/cardinality-sqlserver';
const fixture=await Bun.file('fixtures/validation/cardinality-sqlserver-profile-native.json').json(),nativeSource:string=fixture.nativeSource;
function source(text=nativeSource){return upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importSqlServerCatalog(text,{id:'logical'})).target).target).target;}
test('logical representations retain physical scalar metadata and exact native text',()=>{
 for(const column of getSqlServerColumnMetadata(source()))for(const profile of ['native-scalar','json-array','json-object','unresolved'] as const)for(const mode of ['strict','report'] as const){
  const input=source(),constraint=getSqlServerConstraintMetadata(input).tables.find(t=>t.table.name===column.table.name)!.checks[0];
  const constraintName=constraint?.kind==='object'&&constraint.members.name?.kind==='string'?constraint.members.name.value:null;
  const r=classifySqlServerCardinality(input,{column:column.path,nativeSource,identity:{module:'logical',element:'value'},constraint:profile==='native-scalar'?null:constraintName,profile,mode});
  const exact=profile==='native-scalar'||profile==='json-array'&&column.table.name==='array_value';
  expect(r.status).toBe(mode==='strict'&&!exact?'blocked':'classified');
  if(r.status==='blocked'){expect(r.target).toBeUndefined();continue;}
  expect(r.target!.modules.find(m=>m.id==='sqlserver.columns')).toEqual(input.modules.find(m=>m.id==='sqlserver.columns'));
  const logical=r.target!.modules.find(m=>m.id==='logical')!.elements[0]!;
  expect(logical.cardinality).toBe(profile==='native-scalar'?'one':profile==='json-array'&&column.table.name==='array_value'?'array':profile==='json-object'&&column.table.name==='object_value'?'map':'unspecified');
  if(logical.cardinality==='array'||logical.cardinality==='map')expect(logical.scalarType).toBeUndefined();
  expect(exportSqlServerCatalog(r.target!)).toBe(exportSqlServerCatalog(input));
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverSqlServerCardinalitySource(saved,saved.target!)).toBe(nativeSource);}
 }
},120000);
test('existing logical and physical identities, altered receipts and stale models cannot be overwritten',()=>{
 const input=source(),column=getSqlServerColumnMetadata(input)[0]!.path;
 const request={column,nativeSource,identity:{module:'logical',element:'value'},constraint:null,profile:'native-scalar' as const,mode:'report' as const};
 const r=classifySqlServerCardinality(input,request);
 expect(classifySqlServerCardinality(r.target!,request).status).toBe('blocked');
 expect(classifySqlServerCardinality(input,{...request,identity:{module:'sqlserver.columns',element:'another'}}).status).toBe('blocked');
 const forged=structuredClone(r);forged.mapping.cardinality='map';expect(()=>recoverSqlServerCardinalitySource(forged,r.target!)).toThrow();
 const stale=structuredClone(r.target!);stale.future=true;expect(()=>recoverSqlServerCardinalitySource(r,stale)).toThrow();
});

test('unknown native numeric tokens survive separate logical representation',()=>{
 const text=nativeSource.trim().slice(0,-1)+',"future":900719925474099312345678901234567890}';
 const input=source(text),column=getSqlServerColumnMetadata(input).find(c=>c.table.name==='array_value')!;
 const constraint=getSqlServerConstraintMetadata(input).tables.find(t=>t.table.name==='array_value')!.checks[0]!;
 const name=constraint.kind==='object'&&constraint.members.name?.kind==='string'?constraint.members.name.value:null;
 const r=classifySqlServerCardinality(input,{column:column.path,nativeSource:text,identity:{module:'logical',element:'array'},constraint:name,profile:'json-array',mode:'strict'});
 expect(r.status).toBe('classified');expect(recoverSqlServerCardinalitySource(r,r.target!)).toBe(text);
 expect(exportSqlServerCatalog(r.target!)).toContain('900719925474099312345678901234567890');
});
