// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createPostgresqlSqlEngine} from '../../src/index-node-v4';
import {isNativeUmfCoreError} from '../../bindings/core/node/index.js';

// This test requires the production native-postgresql host feature.
test('native PostgreSQL Node engine edits SQL through the bundled parser',()=>{
 const engine=createPostgresqlSqlEngine();
 const original=engine.importSql('SELECT 1 AS value','node-native-postgresql');
 const edited=engine.editNode(original,'/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival','2') as {document:unknown;validation:{valid:boolean}};
 expect(edited.validation.valid).toBe(true);
 const sql=engine.exportSql(edited.document);
 expect(sql).toContain('2');
 expect(engine.inspect(engine.importSql(sql,'node-reparsed'))).toMatchObject({valid:true});
 expect(engine.getSource(original)).toBe('SELECT 1 AS value');
 let refusal:unknown;try{engine.importSql('SELECT FROM','node-invalid');}catch(error){refusal=error;}
 expect(isNativeUmfCoreError(refusal)).toBe(true);
 expect(refusal).toMatchObject({code:'POSTGRESQL_PARSE'});
},60_000);
