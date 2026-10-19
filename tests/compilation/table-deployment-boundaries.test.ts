// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readdir,readFile} from 'node:fs/promises';
import {checkTableDeploymentBoundaries} from '../../scripts/check-table-deployment-boundaries';
test('actual deployment sources have declared pure compilation owners',async()=>{
 const base=new URL('../../src/table-deployment/',import.meta.url),files=(await readdir(base)).filter(f=>f.endsWith('.ts'));
 expect(checkTableDeploymentBoundaries(Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,base),'utf8')]))))).toEqual([]);
 expect(checkTableDeploymentBoundaries({'migration/index.ts':await readFile(new URL('../../src/table-migration/index.ts',import.meta.url),'utf8')})).toEqual([]);
});
test('migration plan owner cannot import hosts, SDKs or private compiler internals',()=>{
 for(const text of ["import x from 'node:fs';","import x from '../access';","import x from '../table-deployment/ddl';","fetch('https://example.invalid')","import('../table-deployment')","new Function('return 1')"]){
  expect(checkTableDeploymentBoundaries({'migration/index.ts':text}).length).toBeGreaterThan(0);
 }
});
test('deployment cannot acquire filesystem, driver, native compiler or dynamic execution hooks',()=>{
 for(const[file,text]of [['unknown.ts','export const x=1;'],['ddl.ts',"import fs from 'node:fs';"],['index.ts',"import weft from 'weft';"],['types.ts',"export * from '../access';"],['configuration.ts',"import('./ddl');"],['policies.ts',"fetch('https://example.invalid')"],['sql.ts',"new Function('return 1')"],['sql.ts',"globalThis['eval']('1')"]])expect(checkTableDeploymentBoundaries({[file!]:text!}).length).toBeGreaterThan(0);
});
