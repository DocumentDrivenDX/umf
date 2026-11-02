// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {chmod,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {copySourceSnapshotFile} from './copy-source-snapshot';

test('source snapshot copy preserves bytes and digest using the stream path',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-source-snapshot-copy-'));
 try{
  const source=join(directory,'source.bin');
  const target=join(directory,'snapshot.bin');
  const bytes=Buffer.from(Array.from({length:65537},(_,index)=>(index*37)&0xff));
  await writeFile(source,bytes);
  await chmod(source,0o640);
  await copySourceSnapshotFile(source,target);
  const copied=await readFile(target);
  const sha256=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
  expect(copied).toEqual(bytes);
  expect(sha256(copied)).toBe(sha256(bytes));
  expect((await stat(target)).mode&0o777).toBe(0o640);
  await expect(copySourceSnapshotFile(source,target)).rejects.toMatchObject({code:'EEXIST'});
 }finally{
  await rm(directory,{recursive:true,force:true});
 }
});
