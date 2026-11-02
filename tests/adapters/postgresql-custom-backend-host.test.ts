// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {codecRoundTrip,deparseTree,parse} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,importPostgresqlSql,proposePostgresqlNodeEdit} from '../../src/index-node-v4';
import type {PostgresqlBackend} from '../../src/adapters/postgresql/index';

test('public Rust ParserSession preserves the supplied backend and cancels a failed callback',async()=>{
 let failOnce=true;
 const backend:PostgresqlBackend={
  identity:'@libpg-query/parser@17.6.10',
  async parse(sql){if(failOnce){failOnce=false;throw new Error('one-shot host failure');}return parse(sql);},
  deparse:deparseTree,
  codecRoundTrip,
 };
 await expect(importPostgresqlSql('SELECT 1 AS value',backend,{id:'callback-failure'})).rejects.toThrow('one-shot host failure');
 const original=await importPostgresqlSql('SELECT 1 AS value',backend,{id:'custom-backend'});
 const edited=proposePostgresqlNodeEdit(original,'/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival','2');
 expect(edited.validation.valid).toBe(true);
 const sql=await exportPostgresqlSql(edited.document,backend);
 expect(sql).toContain('2');
 expect((await importPostgresqlSql(sql,backend,{id:'custom-reparsed'})).id).toBe('custom-reparsed');
},60_000);
