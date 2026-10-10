import {test,expect} from 'bun:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {snapshotPack,exportPack} from '../../scripts/loaders/export';
import {runLoader} from '../../scripts/loaders/engine';
import {hash} from '../../scripts/loaders/state';
import {projectSecSubmissions} from '../../src/domain-packs/public-company';
const root=resolve('spec/domain-packs/public-company-intelligence');
test('@covers US-078-AC6 @covers US-078-AC7 shared companion exports exact closure and replays selected retained bytes without network',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'umf-public-loader-'));
 try{
  const snapshot=await snapshotPack(join(root,'pack.json'),true),p=snapshot.pack;
  expect(p.loader.profile).toBe('sec-filings');
  for(const artifact of p.loader.artifacts)expect(hash(snapshot.entries.get(artifact.reference)!)).toBe(artifact.sha256);
  const inventory=await Bun.file(join(root,'inventory.json')).json();expect(inventory.entries).toHaveLength(50);expect(inventory.request_interval_ms).toBe(1000);
  expect(inventory.entries.every((e:any)=>e.metadata.membership_basis==='selected-research-universe'&&e.license.redistribution==='allowed')).toBe(true);
  const selection=await Bun.file(join(root,'source-selection.json')).json(),input=selection.inputs[0],bytes=new Uint8Array(await Bun.file(join(root,input.reference)).arrayBuffer());
  // Injected response fixture; this is not a live response from the selected URL.
  const inv={...inventory,entries:[{...inventory.entries[0],metadata:{...inventory.entries[0].metadata,transport:'injected-scoped-json-fixture'}}]};
  const options={state:join(dir,'state'),pack:p,packHash:hash(snapshot.entries.get('domain-pack.json')!),inventoryText:JSON.stringify(inv),mode:'backfill' as const,rights:'redistribute' as const,userAgent:'UMF test fixture test@example.invalid'};
  expect((await runLoader(options,{fetch:async()=>new Response(bytes,{headers:{'content-type':'application/json'}})})).status).toBe('complete');
  const pointer=await Bun.file(join(options.state,'current.json')).text();
  const failed=await runLoader({...options,mode:'refresh'},{fetch:async()=>new Response('blocked',{status:403})});expect(failed.status).toBe('failed');expect(failed.items[0]?.code).toBe('HTTP_403');expect(await Bun.file(join(options.state,'current.json')).text()).toBe(pointer);
  const output=join(dir,'export');await exportPack(join(root,'pack.json'),output,{includeSources:true});
  const child=Bun.spawn(['bun',join(output,'run.ts'),'--pack',join(output,'domain-pack.json'),'--state',options.state,'--mode','replay','--rights','redistribute'],{cwd:tmpdir(),env:{...process.env,UMF_LOADER_USER_AGENT:''},stdout:'pipe',stderr:'pipe'});
  const [out,error]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);expect({code:await child.exited,error}).toEqual({code:0,error:''});const receipt=JSON.parse(out);expect(receipt.status).toBe('complete');expect(receipt.items[0].attempts).toBe(0);
  const current=JSON.parse(await Bun.file(join(options.state,'current.json')).text()),publication=JSON.parse(await Bun.file(join(options.state,current.manifest)).text());expect(publication.rows[0].sha256).toBe(hash(bytes));
  const selectionFile=join(dir,'selection.json');await Bun.write(selectionFile,JSON.stringify([{id:inv.entries[0].id,revision:hash(bytes)}]));
  const bridgeOutput=join(dir,'selected');
  const bridge=Bun.spawn(['bun',join(output,'read-publication.ts'),'--state',options.state,'--selection',selectionFile,'--output',bridgeOutput],{cwd:tmpdir(),stdout:'pipe',stderr:'pipe'});
  const [bridgeText,bridgeError]=await Promise.all([new Response(bridge.stdout).text(),new Response(bridge.stderr).text()]);expect({code:await bridge.exited,error:bridgeError}).toEqual({code:0,error:''});expect(JSON.parse(bridgeText).status).toBe('complete');
  const handoff=await Bun.file(join(bridgeOutput,'selection.json')).json();
  const retained=await Bun.file(join(bridgeOutput,handoff.sources[0].reference)).text();expect(hash(retained)).toBe(hash(bytes));
  const projected=projectSecSubmissions(retained,input.id);expect(projected.companies[0]!.id).toBe(input.cik);expect(projected.filings.length).toBeGreaterThan(0);
 }finally{await rm(dir,{recursive:true,force:true});}
},30000);
