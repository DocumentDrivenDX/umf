// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,projectBindingIndexesToPostgresql} from '../../src/index-node-v4';

const fixture=JSON.parse(readFileSync('fixtures/binding/postgresql-indexes/case.json','utf8'));
const focusedBinding=structuredClone(fixture.binding);
focusedBinding.extensions['umf.binding'].indexes=[fixture.binding.extensions['umf.binding'].indexes[4],fixture.binding.extensions['umf.binding'].indexes[7]];
const source=readFileSync(fixture.native,'utf8');
const native=await importPostgresqlSql(source,backend,{id:'native-table'});

test('standalone PostgreSQL index projection uses native Rust mapping and strict refusal',async()=>{
 const result=await projectBindingIndexesToPostgresql(fixture.logical,focusedBinding,native,backend,'report');
 expect(result.status).toBe('reported');expect(result.residuals).toHaveLength(1);
 expect(result.candidate?.match(/CREATE (?:UNIQUE )?INDEX/g)).toHaveLength(1);
 expect(result.candidate).toContain('"payload" #>> ARRAY[\'customer\',\'region\']::text[]');
 const strict=await projectBindingIndexesToPostgresql(fixture.logical,focusedBinding,native,backend,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
},120_000);
