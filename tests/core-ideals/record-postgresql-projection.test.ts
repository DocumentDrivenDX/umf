import {test,expect} from 'bun:test';
import {postgresqlRecordCase,postgresqlRecordProjectionCases} from '../../scripts/core-ideals/record-postgresql-projection-cases';
import {projectRecordToPostgresql,recoverRecordFromPostgresql} from '../../src/core-ideals/record-postgresql-projection';
import {getPostgresqlDdlDeclarations} from '../../src/adapters/postgresql/declarations';
import {getPostgresqlSource,exportPostgresqlSql} from '../../src/adapters/postgresql';
import {backend} from '../../native/postgresql/runtime';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
test('record members compile in ideal order and recover source through both receipt formats',async()=>{
 for(const empty of [false,true]){const {source,author,request}=postgresqlRecordCase('Orders',empty),result=await projectRecordToPostgresql(author,request,backend);
 expect(result.status).toBe('projected');expect(result.residuals).toEqual([]);expect(getPostgresqlSource(result.target!)).toBe(result.nativeSql!);
 expect(getPostgresqlDdlDeclarations(result.target!).declarations[0]!.columns.map(c=>c.element.name)).toEqual(empty?[]:['id','label','active']);
 await exportPostgresqlSql(result.target!,backend);
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(await recoverRecordFromPostgresql(receipt,result.nativeSql!,backend)).toEqual(source);}
 }
});
test('strict losses and missing bindings expose no partial SQL or target',async()=>{
 for(const c of postgresqlRecordProjectionCases()){
 const result=await projectRecordToPostgresql(c.author,c.request,backend),blocked=c.variant==='missing'||c.variant==='mismatch'&&c.request.mode==='strict';
 expect(result.status).toBe(blocked?'blocked':'projected');if(blocked){expect(Object.hasOwn(result,'target')).toBe(false);expect(Object.hasOwn(result,'nativeSql')).toBe(false);}else expect(await recoverRecordFromPostgresql(result,result.nativeSql!,backend)).toEqual(c.source);
 }
});
test('name collisions, unknown bindings and unsafe identifiers fail without partial output',async()=>{
 for(const mode of ['strict','report'] as const){const c=postgresqlRecordCase();c.request.mode=mode;c.request.fields[0]!.columnName=c.request.fields[1]!.columnName;const result=await projectRecordToPostgresql(c.author,c.request,backend);expect(result.status).toBe('blocked');expect(Object.hasOwn(result,'nativeSql')).toBe(false);}
 const c=postgresqlRecordCase();await expect(projectRecordToPostgresql(c.author,{...c.request,namespace:'x'.repeat(64)},backend)).rejects.toThrow();
 c.request.fields[0]!.nativeType='unregistered' as any;await expect(projectRecordToPostgresql(c.author,c.request,backend)).rejects.toThrow();
});
test('stale author declarations, native edits and changed receipts fail recovery',async()=>{
 const c=postgresqlRecordCase(),result=await projectRecordToPostgresql(c.author,c.request,backend);
 await expect(recoverRecordFromPostgresql(result,result.nativeSql!+' ',backend)).rejects.toThrow();result.mappings[0]!.idealPath='/forged';await expect(recoverRecordFromPostgresql(result,result.nativeSql!,backend)).rejects.toThrow();
 c.request.fields[0]!.author.target.future=true;await expect(projectRecordToPostgresql(c.author,c.request,backend)).rejects.toThrow();
});
