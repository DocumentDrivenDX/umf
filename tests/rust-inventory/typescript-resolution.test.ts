// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {copyFile,mkdir,mkdtemp,realpath,symlink,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

test('compiler census retains logical dependency paths across linked installations without hiding external source imports',async()=>{
 const area=await mkdtemp(join(tmpdir(),'umf-inventory-resolution-')),root=join(area,'project');
 try{
  for(const path of ['scripts','src','node_modules'])await mkdir(join(root,path),{recursive:true});
  await mkdir(join(area,'dependency'));
  await writeFile(join(area,'dependency/package.json'),JSON.stringify({name:'fixture-package',version:'1.0.0',types:'index.d.ts'}));
  await writeFile(join(area,'dependency/index.d.ts'),'export interface External {value: string}\n');
  await writeFile(join(area,'outside.ts'),'export interface Outside {value: number}\n');
  await writeFile(join(root,'src/consumer.ts'),"export type {External} from 'fixture-package';\nexport type {Outside} from '../../outside';\n");
  await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',types:[]},include:['src/**/*.ts']}));
  for(const name of ['typescript-api','yaml'])await symlink(await realpath(resolve('node_modules',name)),join(root,'node_modules',name),'dir');
  await symlink(join(area,'dependency'),join(root,'node_modules/fixture-package'),'dir');
  await copyFile('scripts/rust-inventory-typescript.ts',join(root,'scripts/rust-inventory-typescript.ts'));
  const child=Bun.spawn([process.execPath,join(root,'scripts/rust-inventory-typescript.ts')],{cwd:root,stdout:'pipe',stderr:'pipe'});
  const [status,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  if(status!==0)throw Error(stderr);
  const census=JSON.parse(stdout);
  expect(census.files['src/consumer.ts'].resolvedImports).toEqual(['../outside.ts','node_modules/fixture-package/index.d.ts']);
 }finally{await Bun.$`rm -r ${area}`.quiet();}
},30_000);
