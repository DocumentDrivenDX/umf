// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {importSqlServerCatalog,projectBindingIndexesToSqlServer} from '../../src/index-node-v4';

const fixture=JSON.parse(readFileSync('fixtures/binding/sqlserver-indexes/case.json','utf8'));
const source=readFileSync(fixture.native,'utf8');
const native=importSqlServerCatalog(source,{id:'sqlserver-native'});

test('standalone SQL Server index projection uses native Rust route and preserves strict refusal',()=>{
 const result=projectBindingIndexesToSqlServer(fixture.logical,fixture.binding,native,source,'report');
 expect(result.status).toBe('reported');
 expect(result.candidate?.match(/CREATE (?:UNIQUE )?NONCLUSTERED INDEX/g)).toHaveLength(3);
 expect(result.nativeSource).toBe(source);
 const strict=projectBindingIndexesToSqlServer(fixture.logical,fixture.binding,native,source,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();expect(strict.nativeSource).toBe(source);
},60_000);
