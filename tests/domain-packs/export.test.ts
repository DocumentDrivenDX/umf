import {test,expect} from 'bun:test';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

async function run(pack:string,output:string,check=false){
 const child=Bun.spawn(['bun','scripts/export-domain-pack.ts','--pack',pack,'--output',output,...(check?['--check']:[])],{stdout:'pipe',stderr:'pipe'});
 await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 return await child.exited;
}

test('local pack export checks snapshots without fetching external dataset references',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-pack-export-'));
 try {
  const source=join(directory,'source'),output=join(directory,'output');
  await cp('spec/domain-packs/legal',source,{recursive:true});
  const path=join(source,'pack.json'),pack=await Bun.file(path).json();
  pack.sources.published_fixture={kind:'external',data_kind:'fabricated',reference:'unavailable-fixture.csv',format:'csv',license:{redistribution:'unknown'}};
  await Bun.write(path,JSON.stringify(pack));
  expect(await run(path,output)).toBe(0);
  expect(await run(path,output,true)).toBe(0);
  expect((await Bun.file(join(output,'domain-pack.json')).json()).sources.published_fixture).toEqual(pack.sources.published_fixture);
  await Bun.write(join(output,'umf/clients.json'),'stale');
  expect(await run(path,output,true)).not.toBe(0);
 } finally {await rm(directory,{recursive:true,force:true});}
});

test('schema artifact traversal refuses instead of reading outside the source pack',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-pack-boundary-'));
 try {
  const path=join(directory,'pack.json');
  await Bun.write(path,JSON.stringify({id:'boundary',version:'1.0.0',domain_types:{row:{}},generator:{id:'consumer.boundary',version:'1.0.0'},schemas:[{id:'row',format:'json',reference:'../outside.json'}]}));
  expect(await run(path,join(directory,'output'))).not.toBe(0);
 } finally {await rm(directory,{recursive:true,force:true});}
});
