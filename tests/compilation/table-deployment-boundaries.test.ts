// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readdir,readFile} from 'node:fs/promises';
import {checkTableDeploymentBoundaries} from '../../scripts/check-table-deployment-boundaries';
test('actual deployment sources have declared pure compilation owners',async()=>{
 const base=new URL('../../src/table-deployment/',import.meta.url),files=(await readdir(base)).filter(f=>f.endsWith('.ts'));
 expect(checkTableDeploymentBoundaries(Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,base),'utf8')]))))).toEqual([]);
 const migration=new URL('../../src/table-migration/',import.meta.url),migrationFiles=(await readdir(migration)).filter(f=>f.endsWith('.ts'));
 const migrationSources=Object.fromEntries(await Promise.all(migrationFiles.map(async f=>['migration/'+f,await readFile(new URL(f,migration),'utf8')])));
 expect(checkTableDeploymentBoundaries(migrationSources)).toEqual([]);
});
test('deployment and migration wrappers reject private compiler imports and host hooks',()=>{
 for(const file of ['rust-default.ts','migration/rust-default.ts','migration/inventory-rust-default.ts']){
  for(const text of [
   "import x from 'node:fs';",
   "import x from '../access';",
   "import x from '../table-deployment/ddl';",
   "fetch('https://example.invalid')",
   "import('../table-deployment')",
   "new Function('return 1')",
  ])expect(checkTableDeploymentBoundaries({[file]:text}).length).toBeGreaterThan(0);
 }
 expect(checkTableDeploymentBoundaries({'migration/unowned.ts':'export const value=1;'}).length).toBeGreaterThan(0);
});
test('row-scope contract has an explicit pure-source owner and rejects host/compiler hooks',()=>{
 expect(checkTableDeploymentBoundaries({'authoring/row-scope-types.ts':"import type {TablePolicy} from '../extensions/tables/types'; import type {Json} from '../model/types'; export type Result={policy?:TablePolicy;source?:Json};"})).toEqual([]);
 for(const text of ["import fs from 'node:fs';",'fetch(\'https://example.invalid\')',"import('../table-deployment/ddl')",'process.env.HOME'])expect(checkTableDeploymentBoundaries({'authoring/row-scope-types.ts':text}).length).toBeGreaterThan(0);
});
