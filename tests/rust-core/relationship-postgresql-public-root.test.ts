// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectRelationshipsToPostgresql,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative,verifyRelationshipPostgresqlProjection} from '../../src/index-node-v4';
import {postgresqlRelationshipCases} from '../../scripts/core-ideals/relationship-postgresql-cases';
import {backend} from '../../native/postgresql/runtime';

test('Rust default PostgreSQL authored relationship projection and retained recovery',async()=>{
 const c=postgresqlRelationshipCases().find(x=>x.expected==='projected')!;
 const result=await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend);
 expect(result.status).toBe('projected');
 const nativeSql=result.nativeSql;
 expect(nativeSql).toBeDefined();
 if(nativeSql===undefined)throw new Error('Projected result omitted native SQL');
 expect(nativeSql).toContain('FOREIGN KEY');
 expect(result.mappings.length).toBeGreaterThan(0);
 expect(await verifyRelationshipPostgresqlProjection(result,result.target!,backend)).toEqual(result);
 expect(await recoverRelationshipPostgresqlIdeal(result,result.target!,backend)).toEqual(c.source);
 expect(await recoverRelationshipPostgresqlNative(result,result.target!,backend)).toBe(nativeSql);
 const strict=await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,{...c.request,mode:'strict'},backend);
 expect(strict.status).toBe('blocked');
 expect(strict.nativeSql).toBeUndefined();
});
