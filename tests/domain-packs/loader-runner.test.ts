import {test,expect} from 'bun:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runLoader} from '../../scripts/loaders/engine';
const body='%PDF-1.4\nsynthetic, not a court decision\n';
const makeInventory=(entries:any[]=[],extra:any={})=>({version:'1.0.0',id:'test-court',allowed_hosts:['court.example.org'],request_interval_ms:100,max_bytes:1024,max_total_bytes:4096,max_documents:10,timeout_ms:1000,retries:0,entries,...extra});
const entry={id:'court:1',url:'https://court.example.org/opinion.pdf',media_type:'application/pdf',license:{redistribution:'unknown'},metadata:{court:'fixture',uninterpreted:{x:'preserve'}}};
const pack={id:'test',version:'1.0.0',loader:{profile:'court-documents'}};
async function setup(fn:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'umf-loader-test-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const options=(root:string,inventory:any)=>({state:root,pack,packHash:'a'.repeat(64),inventoryText:JSON.stringify(inventory),mode:'backfill' as const,rights:'local-use' as const,userAgent:'UMF fixture contact@example.org'});
const transport=(content=body)=>async()=>new Response(content,{headers:{'content-type':'application/pdf'}});
async function current(root:string){const pointer=JSON.parse(await readFile(join(root,'current.json'),'utf8'));return {pointer,manifest:JSON.parse(await readFile(join(root,pointer.manifest),'utf8'))};}
test('revisions, metadata observations and replay @covers US-060-AC9 @covers US-060-AC11',async()=>setup(async root=>{
 let requests=0;const fetch=async()=>{requests++;return transport()();};const inv=makeInventory([entry]);
 expect((await runLoader(options(root,inv),{fetch})).status).toBe('complete');
 let c=await current(root);expect(c.manifest.history).toHaveLength(1);
 expect(await readFile(join(root,c.pointer.manifest.replace('manifest.json','objects/')+c.manifest.history[0].sha256),'utf8')).toBe(body);
 await runLoader({...options(root,inv),mode:'refresh'},{fetch});c=await current(root);expect(c.manifest.history).toHaveLength(1);
 await runLoader({...options(root,inv),mode:'refresh'},{fetch:transport(body+'amended')});c=await current(root);expect(c.manifest.history).toHaveLength(2);
 const moved=makeInventory([{...entry,url:'https://court.example.org/renamed.pdf',metadata:{changed:true}}]);
 await runLoader({...options(root,moved),mode:'refresh'},{fetch});c=await current(root);expect(c.manifest.history).toHaveLength(3);
 const before=await readFile(join(root,c.pointer.manifest.replace('manifest.json','documents.jsonl')),'utf8');
 const replay=await runLoader({...options(root,moved),mode:'replay'},{fetch:async()=>{throw Error('NETWORK FORBIDDEN');}});expect(replay.status).toBe('complete');
 c=await current(root);expect(await readFile(join(root,c.pointer.manifest.replace('manifest.json','documents.jsonl')),'utf8')).toBe(before);
 expect(c.manifest.rows[0].metadata).toEqual({changed:true});expect(requests).toBe(3);
 await Bun.write(join(root,c.pointer.manifest.replace('manifest.json','objects/')+c.manifest.history[0].sha256),'tampered');
 expect((await runLoader({...options(root,moved),mode:'replay'},{fetch})).status).toBe('failed');
}));
test('failure, empty success, retry, concurrency and commit interruption @covers US-060-AC10',async()=>setup(async root=>{
 const o=options(root,makeInventory([entry]));await runLoader(o,{fetch:transport()});const before=(await current(root)).pointer;
 let r=await runLoader({...o,mode:'refresh'},{fetch:async()=>new Response('unavailable',{status:503})});expect(r.status).toBe('failed');expect(r.items[0]?.code).toBe('HTTP_503');expect((await current(root)).pointer).toEqual(before);
 r=await runLoader({...o,mode:'refresh'},{fetch:transport(),beforeCommit:async()=>{throw Error('INTERRUPTED');}});expect(r.status).toBe('failed');expect((await current(root)).pointer).toEqual(before);
 await Bun.write(join(root,'lock'),'other process');await expect(runLoader(o,{fetch:transport()})).rejects.toThrow('STATE_LOCKED');await rm(join(root,'lock'));
 r=await runLoader({...o,inventoryText:JSON.stringify(makeInventory([])),mode:'refresh'},{fetch:transport()});expect(r.status).toBe('complete');expect(r.items).toHaveLength(0);
 expect((await current(root)).manifest.history).toHaveLength(1);
}));
test('rights, URL, media and budget refusal @covers US-060-AC12',async()=>setup(async root=>{
 let calls=0;const fetch=async()=>{calls++;return transport()();};
 await expect(runLoader({...options(root,makeInventory([entry])),rights:'redistribute'},{fetch})).rejects.toThrow('SOURCE_RIGHTS');
 await expect(runLoader(options(root,makeInventory([{...entry,url:'https://court.example.org.evil.org/a'}])),{fetch})).rejects.toThrow('SOURCE_URL_POLICY');expect(calls).toBe(0);
 const r=await runLoader(options(root,makeInventory([entry],{max_bytes:4})),{fetch});expect(r.status).toBe('failed');expect(r.items[0]?.code).toBe('BYTE_LIMIT');
 expect((await runLoader(options(root,makeInventory([entry])),{fetch:async()=>new Response('html',{headers:{'content-type':'text/html'}})})).items[0]?.code).toBe('MEDIA_TYPE');
}));
test('A B A revisions, shared objects, removal and observation context @covers US-060-AC9',async()=>setup(async root=>{
 const first=makeInventory([entry,{...entry,id:'court:2'}]);
 await runLoader(options(root,first),{fetch:transport()});
 await runLoader({...options(root,makeInventory([entry])),mode:'refresh'},{fetch:transport(body+'B')});
 await runLoader({...options(root,makeInventory([entry])),mode:'refresh'},{fetch:transport()});
 const c=await current(root);expect(c.manifest.history).toHaveLength(3);expect(c.manifest.rows[0].sha256).toBe(c.manifest.history[0].sha256);expect(c.manifest.observations).toHaveLength(4);
 expect(Object.keys(c.manifest.inventory_history)).toHaveLength(2);
 await expect(runLoader(options(root,makeInventory([entry,entry])),{fetch:transport()})).rejects.toThrow('INVENTORY_IDENTITIES');
}));
test('post-commit cleanup and external inventory replay refusal @covers US-060-AC10 @covers US-060-AC11',async()=>setup(async root=>{
 const o=options(root,makeInventory([entry]));await runLoader(o,{fetch:transport()});const before=(await current(root)).pointer;
 const r=await runLoader({...o,mode:'refresh'},{fetch:transport(),afterCommit:async()=>{throw Error('cleanup');}});expect(r.status).toBe('complete');expect(r.cleanup_warning).toBe(true);expect((await current(root)).pointer).not.toEqual(before);
 const mismatch=await runLoader({...o,mode:'replay',inventoryText:JSON.stringify(makeInventory([]))},{fetch:async()=>{throw Error('no network');}});expect(mismatch.code).toBe('REPLAY_INVENTORY_MISMATCH');
 const replay=await runLoader({state:root,pack,packHash:o.packHash,mode:'replay',rights:'local-use'},{fetch:async()=>{throw Error('no network');}});expect(replay.status).toBe('complete');
}));
test('native loopback TLS streams, transient retries and timeouts @covers US-060-AC12',async()=>setup(async root=>{
 const cert=join(root,'cert.txt'),key=join(root,'private.txt');
 const openssl=Bun.spawn(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout',key,'-out',cert,'-days','1'],{stdout:'pipe',stderr:'pipe'});
 await Promise.all([new Response(openssl.stdout).text(),new Response(openssl.stderr).text()]);expect(await openssl.exited).toBe(0);
 let count=0,slow=false;
 const server=Bun.serve({hostname:'127.0.0.1',port:0,tls:{cert:Bun.file(cert),key:Bun.file(key)},fetch(){count++;if(slow)return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('%PDF-'));const timer=setTimeout(()=>{try{controller.close();}catch{}},3000);(controller as any).__timer=timer;}}),{headers:{'content-type':'application/pdf'}});if(count===1)return new Response('retry',{status:503});return new Response(body,{headers:{'content-type':'application/pdf'}});}});
 try{
  const waits:number[]=[];
  const localFetch=(_url:string,init?:RequestInit)=>fetch('https://127.0.0.1:'+server.port+'/',{...init,tls:{rejectUnauthorized:false}} as any);
  const r=await runLoader(options(join(root,'ok'),makeInventory([entry],{retries:1})),{fetch:localFetch,sleep:async ms=>{waits.push(ms);}});
  expect(r.status).toBe('complete');expect(r.items[0]?.attempts).toBe(2);expect(count).toBe(2);expect(waits.some(n=>n>=1000)).toBe(true);
  slow=true;const timeout=await runLoader(options(join(root,'slow'),makeInventory([entry])),{fetch:localFetch});expect(timeout.items[0]?.code).toBe('TIMEOUT');
 }finally{server.stop(true);}
}));
test('aggregate bytes across retries and response refusal @covers US-060-AC12',async()=>setup(async root=>{
 let n=0;const r=await runLoader(options(root,makeInventory([entry],{retries:2,max_total_bytes:8})),{sleep:async()=>{},fetch:async()=>{n++;return new Response('12345',{status:503});}});expect(n).toBe(2);expect(r.items[0]?.code).toBe('BYTE_LIMIT');
 expect((await runLoader(options(join(root,'redirect'),makeInventory([entry])),{fetch:async()=>new Response('',{status:302,headers:{location:'https://attacker.invalid'}})})).items[0]?.code).toBe('REDIRECT');
 expect((await runLoader(options(join(root,'magic'),makeInventory([entry])),{fetch:transport('not-pdf')})).items[0]?.code).toBe('PDF_MAGIC');
}));
test('real process interruption before and after publication commit @covers US-060-AC10',async()=>setup(async root=>{
 for(const phase of ['beforeCommit','afterCommit']){
  const state=join(root,phase),o=options(state,makeInventory([entry]));await runLoader(o,{fetch:transport()});const before=(await current(state)).pointer;
  const script=join(root,phase+'.ts'),ready=join(root,phase+'-ready');
  await Bun.write(script,`import {runLoader} from ${JSON.stringify(join(import.meta.dir,'../../scripts/loaders/engine.ts'))};\nawait runLoader(${JSON.stringify({...o,mode:'refresh'})},{fetch:async()=>new Response(${JSON.stringify(body+'changed')},{headers:{'content-type':'application/pdf'}}),${phase}:async()=>{await Bun.write(${JSON.stringify(ready)},'ready');await new Promise(()=>{});}});`);
  const child=Bun.spawn([process.execPath,script],{stdout:'pipe',stderr:'pipe'});
  try{
   let isReady=false;for(let i=0;i<100;i++){if(await Bun.file(ready).exists()){isReady=true;break;}await new Promise(r=>setTimeout(r,20));}expect(isReady).toBe(true);
   await expect(runLoader(o,{fetch:transport()})).rejects.toThrow('STATE_LOCKED');
  }finally{child.kill('SIGKILL');await child.exited;await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);}
  const c=await current(state);if(phase==='beforeCommit')expect(c.pointer).toEqual(before);else {expect(c.pointer).not.toEqual(before);expect(JSON.parse(await readFile(join(state,c.pointer.manifest.replace('manifest.json','receipt.json')),'utf8')).status).toBe('complete');}
  await rm(join(state,'lock'));expect((await runLoader({...o,mode:'refresh'},{fetch:transport()})).status).toBe('complete');
 }
}));
test('committed metadata and manifest tampering refuse replay @covers US-060-AC11',async()=>setup(async root=>{
 for(const name of ['inventory.json','documents.jsonl','receipt.json','manifest.json']){
  const state=join(root,name),o=options(state,makeInventory([entry]));await runLoader(o,{fetch:transport()});const c=await current(state);
  await Bun.write(join(state,c.pointer.manifest.replace('manifest.json',name)),'tampered');
  const result=await runLoader({...o,mode:'replay'},{fetch:async()=>{throw Error('NETWORK FORBIDDEN');}});expect(result.status).toBe('failed');
 }
}));

test('exhausted run budget starts no later requests @covers US-060-AC12',async()=>setup(async root=>{
 let count=0;const inv=makeInventory([entry,{...entry,id:'second'},{...entry,id:'third'}],{max_total_bytes:4});
 const r=await runLoader(options(root,inv),{fetch:async()=>{count++;return transport()();}});expect(count).toBe(1);expect(r.items).toHaveLength(3);expect(r.items[1]?.attempts).toBe(0);expect(r.items.every(i=>i.code==='BYTE_LIMIT')).toBe(true);
}));
test('SEC profile policy and exact JSON originals @covers US-060-AC12',async()=>setup(async root=>{
 const secEntry={id:'CIK1:accession',url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json',media_type:'application/json',license:{redistribution:'allowed'},metadata:{context:'whole company API bytes only'}};
 const inv=makeInventory([secEntry],{allowed_hosts:['data.sec.gov','www.sec.gov'],request_interval_ms:1000});
 const secPack={...pack,loader:{profile:'sec-filings'}},o={...options(root,inv),pack:secPack};let calls=0;
 const original='{"facts":{"value":9007199254740993.0100,"unit":"USD"}}';
 const fetch=async()=>{calls++;return new Response(original,{headers:{'content-type':'application/json; charset=utf-8'}});};
 expect((await runLoader(o,{fetch,sleep:async()=>{}})).status).toBe('complete');expect((await runLoader({...o,mode:'refresh'},{fetch,sleep:async()=>{}})).status).toBe('complete');
 const c=await current(root);expect(await readFile(join(root,c.pointer.manifest.replace('manifest.json','objects/')+c.manifest.rows[0].sha256),'utf8')).toBe(original);
 expect((await runLoader({state:root,pack:secPack,packHash:o.packHash,mode:'replay',rights:'local-use'},{fetch:async()=>{throw Error('no network');}})).status).toBe('complete');expect(calls).toBe(2);
 await expect(runLoader({...o,state:join(root,'no-agent'),userAgent:undefined} as any,{fetch})).rejects.toThrow('SEC_USER_AGENT');
 await expect(runLoader({...o,inventoryText:JSON.stringify({...inv,request_interval_ms:100})},{fetch})).rejects.toThrow('SEC_POLICY');
 await expect(runLoader({...o,inventoryText:JSON.stringify({...inv,allowed_hosts:['attacker.invalid']})},{fetch})).rejects.toThrow('SEC_POLICY');expect(calls).toBe(2);
}));
