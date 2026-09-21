import {test,expect} from 'bun:test';
import {postgresqlProjectionCases} from '../../scripts/core-ideals/field-postgresql-projection-cases';
import {projectFieldToPostgresql,recoverFieldFromPostgresql} from '../../src/core-ideals/field-postgresql-projection';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlSource} from '../../src/adapters/postgresql';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {type Document} from '../../src/model/types';
test('explicit pg_catalog carriers compile and preserve authored meaning through both receipt formats',async()=>{
 for(const {author,request} of postgresqlProjectionCases()){
  const result=await projectFieldToPostgresql(author,request,backend);expect(result.status).toBe('projected');expect(result.residuals).toEqual([]);expect(result.nativeSql).toContain('pg_catalog.');expect(getPostgresqlSource(result.target!)).toBe(result.nativeSql!);
  expect((await exportPostgresqlSql(result.target!,backend)).length).toBeGreaterThan(0);
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(await recoverFieldFromPostgresql(receipt,result.nativeSql!,backend)).toEqual(author.target);}
 }
},30000);
test('unsafe or truncating identifiers are rejected before parser invocation',async()=>{
 const {author,request}=postgresqlProjectionCases()[0]!;
 for(const value of ['', 'x\0y','\ud800','雪'.repeat(22),'x'.repeat(64)])for(const key of ['namespace','tableName','columnName'] as const)await expect(projectFieldToPostgresql(author,{...request,[key]:value},backend)).rejects.toThrow();
 const result=await projectFieldToPostgresql(author,{...request,tableName:'雪'.repeat(21)},backend);expect(result.status).toBe('projected');
});
test('strict refuses unprojected constraints, while report retains them with explicit diagnostics',async()=>{
 const {author,request}=postgresqlProjectionCases()[0]!,source=copyJson(author.source) as unknown as Document;
 source.modules[0]!.elements[0]!.scalarType='string';source.modules[0]!.elements[0]!.future={exactness:'unknown'};
 const authored=declareCoreElementKind(source,{module:'m',element:'e'},'field');
 const strict=await projectFieldToPostgresql(authored,request,backend);expect(strict.status).toBe('blocked');expect(Object.hasOwn(strict,'target')).toBe(false);expect(Object.hasOwn(strict,'nativeSql')).toBe(false);
 const report=await projectFieldToPostgresql(authored,{...request,mode:'report'},backend);expect(report.status).toBe('projected');expect(report.residuals).toHaveLength(2);expect(report.diagnostics.every(d=>d.severity==='warning')).toBe(true);expect(await recoverFieldFromPostgresql(report,report.nativeSql!,backend)).toEqual(authored.target);
});
test('edited SQL or tampered receipt cannot claim recovery; record/group cannot become a column',async()=>{
 const {author,request}=postgresqlProjectionCases()[0]!,result=await projectFieldToPostgresql(author,request,backend);
 await expect(recoverFieldFromPostgresql(result,result.nativeSql!+' ',backend)).rejects.toThrow();result.mapping.idealPath='/wrong';await expect(recoverFieldFromPostgresql(result,result.nativeSql!,backend)).rejects.toThrow();
 for(const kind of ['record','group'] as const){const a=declareCoreElementKind(author.source,{module:'m',element:'e'},kind);const r=await projectFieldToPostgresql(a,{...request,mode:'report'},backend);expect(r.status).toBe('blocked');expect(Object.hasOwn(r,'nativeSql')).toBe(false);}
});
