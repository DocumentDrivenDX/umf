// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {classifyPostgresqlRelationships,verifyPostgresqlRelationshipClassification,recoverPostgresqlRelationshipSource,importPostgresqlSql} from '../../src/index-node-v4';

test('public PostgreSQL relationship classifier is Rust-owned and retains a verified native archive',async()=>{
 const native='CREATE TABLE parent(id integer PRIMARY KEY);\nCREATE TABLE child(id integer PRIMARY KEY,parent_id integer REFERENCES parent(id) ON DELETE CASCADE);';
 const source=await importPostgresqlSql(native,backend,{id:'relationship-rust'});
 const result=await classifyPostgresqlRelationships(source,{profile:'raw-ddl',mode:'report',nativeSource:native},backend);
 expect(result.status).toBe('classified');expect(result.observations).toHaveLength(1);expect(result.observations[0]?.onDelete).toBe('cascade');
 expect(await verifyPostgresqlRelationshipClassification(result,result.target!,backend)).toEqual(result);
 expect(await recoverPostgresqlRelationshipSource(result,result.target!,backend)).toBe(native);
 const refused=await classifyPostgresqlRelationships(source,{profile:'raw-ddl',mode:'strict',nativeSource:native},backend);
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
