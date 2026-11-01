// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {importSqlServerCatalog,projectSqlServerToDdl,type SqlServerDdlPolicy} from '../../src/index-node-v4';

test('SQL Server catalog to DDL public Node route retains source, reports losses, and blocks unsafe policies',()=>{
 const source=importSqlServerCatalog(readFileSync('fixtures/sqlserver/catalog.json','utf8'),{id:'sqlserver-catalog'});
 const policy:SqlServerDdlPolicy={aliases:'base-type',physicalLayout:'default-rowstore',nativeExpressions:'verbatim',sourceState:'captured-only',lossPolicy:'allow-reported-loss'};
 const result=projectSqlServerToDdl(source,policy);
 expect(result.status).toBe('projected');expect(result.source).toEqual(source);expect(result.statements.length).toBeGreaterThan(0);expect(result.nativeSource).toContain('CREATE TABLE');expect(result.issues.some(issue=>issue.code==='CAPTURE_LOWERING')).toBe(true);
 const strict=projectSqlServerToDdl(source,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.statements).toEqual([]);expect(strict.nativeSource).toBeUndefined();
 const aliasRefusal=projectSqlServerToDdl(source,{...policy,aliases:'reject'});expect(aliasRefusal.status).toBe('blocked');expect(aliasRefusal.statements).toEqual([]);expect(aliasRefusal.nativeSource).toBeUndefined();
},60_000);
