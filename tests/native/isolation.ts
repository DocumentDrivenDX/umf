// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll} from 'bun:test';
import {mkdtemp,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Each test process is a separate reference installation. Descendant consumers
// inherit its durable owner slot so restart/recovery tests retain that boundary.
// Explicitly configured installations remain untouched.
if(process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY===undefined){
 const directory=await mkdtemp(join(tmpdir(),'umf-test-launch-owner-'));
 process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY=directory;
 afterAll(async()=>{
  if(process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY!==directory)throw Error('Test leaked its handler installation configuration');
  let active=false;try{await lstat(join(directory,'active'));active=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  // Never erase unresolved ownership to turn a failed run green.
  if(active)throw Error('Test left an unresolved handler owner at '+directory);
  await rm(directory,{recursive:true});
 });
}
