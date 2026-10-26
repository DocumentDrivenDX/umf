// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readdir,readFile} from 'node:fs/promises';
import {checkTableLifecycleBoundaries} from '../../scripts/check-table-lifecycle-boundaries';
test('actual table lifecycle sources respect the declared owner map',async()=>{
 const base=new URL('../../src/extensions/tables/',import.meta.url),files=(await readdir(base)).filter(f=>f.endsWith('.ts'));
 expect(checkTableLifecycleBoundaries(Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,base),'utf8')]))))).toEqual([]);
});
test('only the named erased accounting type is shared with table context and index',()=>{
 const route="import type {AccountingContext} from '../../model/internal/accounting-context'; export type Meter = AccountingContext;";
 expect(checkTableLifecycleBoundaries({'context.ts':route,'index.ts':route})).toEqual([]);
 for(const[file,source]of [
  ['context.ts',"import {AccountingContext} from '../../model/internal/accounting-context'; export const meter=AccountingContext;"],
  ['context.ts',"import type {R2WorkMeter} from '../../model/internal/accounting-context';"],
  ['columns.ts',route],
  ['context.ts',"import type {AccountingContext} from '../../model/internal/other';"],
 ])expect(checkTableLifecycleBoundaries({[file!]:source!}).length).toBeGreaterThan(0);
});
test('negative ownership, compiler, driver, I/O and executable controls refuse',()=>{
 const cases=[['escape.ts','export const x=1;'],['index.ts',"import fs from 'node:fs';"],['columns.ts',"import weft from 'weft';"],['columns.ts',"export * from './policies';"],['seeds.ts',"import driver from 'psycopg';"],['context.ts',"import('./types');"],['context.ts',"fetch('https://example.invalid');"],['context.ts',"new Function('return 1');"],['context.ts',"globalThis['eval']('1');"]];
 for(const[file,source]of cases)expect(checkTableLifecycleBoundaries({[file!]:source!}).length).toBeGreaterThan(0);
});
