// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {mkdtemp,rename,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {referenceBuildStage} from '../../scripts/reference/stage';

test('normal reference build stages beside output for same-filesystem rename',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-reference-stage-test-'));
 const output=join(root,'missing','dist','reference');
 let stage:string|undefined;
 try{
  stage=await referenceBuildStage(output,false);
  expect(dirname(stage)).toBe(dirname(resolve(output)));
  expect((await stat(stage)).dev).toBe((await stat(dirname(resolve(output)))).dev);
  await writeFile(join(stage,'index.json'),'candidate');
  await rename(stage,output);
  stage=undefined;
 }finally{
  if(stage)await rm(stage,{recursive:true,force:true});
  await rm(root,{recursive:true,force:true});
 }
});

test('--check keeps its temporary stage outside the destination and does not create the output tree',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-reference-check-stage-test-'));
 const output=join(root,'missing','dist','reference');
 let stage:string|undefined;
 try{
  stage=await referenceBuildStage(output,true);
  expect(dirname(stage)).not.toBe(dirname(resolve(output)));
  await expect(stat(dirname(resolve(output)))).rejects.toMatchObject({code:'ENOENT'});
 }finally{
  if(stage)await rm(stage,{recursive:true,force:true});
  await rm(root,{recursive:true,force:true});
 }
});
