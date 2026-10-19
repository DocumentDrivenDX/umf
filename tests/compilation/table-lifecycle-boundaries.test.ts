// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readdir,readFile} from 'node:fs/promises';
import {checkTableLifecycleBoundaries} from '../../scripts/check-table-lifecycle-boundaries';
test('actual table lifecycle sources respect the declared owner map',async()=>{
 const base=new URL('../../src/extensions/tables/',import.meta.url),files=(await readdir(base)).filter(f=>f.endsWith('.ts'));
 expect(checkTableLifecycleBoundaries(Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,base),'utf8')]))))).toEqual([]);
});
test('negative ownership, compiler, driver, I/O and executable controls refuse',()=>{
 const cases=[['escape.ts','export const x=1;'],['index.ts',"import fs from 'node:fs';"],['columns.ts',"import weft from 'weft';"],['columns.ts',"export * from './policies';"],['seeds.ts',"import driver from 'psycopg';"],['context.ts',"import('./types');"],['context.ts',"fetch('https://example.invalid');"],['context.ts',"new Function('return 1');"],['context.ts',"globalThis['eval']('1');"]];
 for(const[file,source]of cases)expect(checkTableLifecycleBoundaries({[file!]:source!}).length).toBeGreaterThan(0);
});
