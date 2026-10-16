import {chromium} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/node_modules/playwright';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='/private/tmp/umf-seal-website-review-20261015',path='/Users/erik/.codex/worktrees/security-action-source-custody/umf/docs/helix/05-deploy/microsite/seal-intent.ts';
const source=readFileSync(path,'utf8'),javascript=new Bun.Transpiler({loader:'ts'}).transformSync(source);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){return new URL(r.url).pathname==='/journal.js'?new Response(javascript,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Independent journal control</title>',{headers:{'content-type':'text/html'}});}});
const origin='http://127.0.0.1:'+server.port,browser=await chromium.launch({headless:true}),cases:any[]=[],external:string[]=[];
const seed=(suffix:string)=>({profile:'umf.demo.seal-intent/1',reference:{profile:'truss-browser-seal-reference/0.1',storeId:'11111111-1111-1111-1111-111111111111',incarnation:'22222222-2222-2222-2222-222222222222',requestKey:'key'+suffix,attempt:'attempt'+suffix,manifestSha256:'a'.repeat(64),planSha256:'b'.repeat(64),modelSha256:'c'.repeat(64)},input:{sql:'original SQL',parameters:{},batchSize:2,maxItems:10000},phase:'pending'});
const check=(name:string,ok:boolean,details?:any)=>{if(!ok)throw Error(name+': '+JSON.stringify(details));cases.push({name,passed:true,...(details?{details}:{})});};
async function context(){const c=await browser.newContext();await c.route('**/*',r=>{if(!r.request().url().startsWith(origin+'/')){external.push(r.request().url());return r.abort();}return r.continue();});return c;}
async function page(c:any){const p=await c.newPage();await p.goto(origin);await p.evaluate(async()=>{(globalThis as any).journal=await import('/journal.js');});return p;}
try{
 {
  const c=await context(),a=await page(c),b=await page(c);const values=[seed('a'),seed('b')];
  const results=await Promise.all([a,b].map((p,i)=>p.evaluate(async(v:any)=>{try{await (globalThis as any).journal.reserveSealIntent(v);return 'reserved';}catch{return 'refused';}},values[i])));
  const actual=await a.evaluate(()=>(globalThis as any).journal.readSealIntent());
  check('Actual simultaneous cross-tab reservations commit exactly one original intent',results.filter(v=>v==='reserved').length===1&&JSON.stringify(actual)===JSON.stringify(values[results.indexOf('reserved')]),{results});
  const before=JSON.stringify(actual),conflict={...actual,reference:{...actual.reference,attempt:'foreign'}};
  const refused=await b.evaluate(async(v:any)=>{try{await (globalThis as any).journal.settleSealIntent(v);return false;}catch{return true;}},conflict);
  check('Foreign/stale settlement cannot overwrite original intent',refused&&JSON.stringify(await b.evaluate(()=>(globalThis as any).journal.readSealIntent()))===before);
  const settled={...actual,phase:'settled',outcome:{outcome:'sealed',reference:actual.reference,manifest:{mediaType:'application/json',utf8:' {"opaque":"manifest"}\n',sha256:'a'.repeat(64)},receipt:{mediaType:'application/json',utf8:' {"opaque":"receipt"}\n',sha256:'d'.repeat(64)}}};
  await a.evaluate((v:any)=>(globalThis as any).journal.settleSealIntent(v),settled);await b.reload();await b.evaluate(async()=>{(globalThis as any).journal=await import('/journal.js');});
  check('Settled full receipt strings survive fresh-page read unchanged',JSON.stringify(await b.evaluate(()=>(globalThis as any).journal.readSealIntent()))===JSON.stringify(settled));await c.close();
 }
 {
  const c=await context(),p=await page(c);const result=await p.evaluate(async(v:any)=>{
   const t:any=globalThis;t.events=[];const original=IDBDatabase.prototype.transaction,add=IDBObjectStore.prototype.add;
   IDBDatabase.prototype.transaction=function(...args:any[]){const tx=Reflect.apply(original,this,args);t.durability=tx.durability;tx.addEventListener('complete',()=>t.events.push('transaction-complete'));return tx;};
   IDBObjectStore.prototype.add=function(...args:any[]){const request=Reflect.apply(add,this,args);request.addEventListener('success',()=>{t.events.push('request-success');queueMicrotask(()=>t.events.push(t.resolved?'early-resolve':'still-pending'));});return request;};
   await t.journal.reserveSealIntent(v);t.resolved=true;t.events.push('reservation-resolved');return {events:t.events,durability:t.durability};
  },seed('completion'));
  check('Strict native transaction completion precedes reservation resolution',result.durability==='strict'&&result.events.join(',')==='request-success,still-pending,transaction-complete,reservation-resolved',result);await c.close();
 }
 {
  const c=await context(),p=await page(c);const result=await p.evaluate(async(v:any)=>{
   const t:any=globalThis,add=IDBObjectStore.prototype.add;t.events=[];
   IDBObjectStore.prototype.add=function(...args:any[]){const request=Reflect.apply(add,this,args),tx=this.transaction;request.addEventListener('success',()=>{t.events.push('request-success');tx.abort();});return request;};
   let rejected=false;try{await t.journal.reserveSealIntent(v);}catch{rejected=true;}return {rejected,read:await t.journal.readSealIntent(),events:t.events};
  },seed('abort'));
  check('Abort after successful add still refuses reservation with no retained intent',result.rejected&&result.read===null&&result.events[0]==='request-success',result);await c.close();
 }
 {
  const c=await context(),p=await page(c);const result=await p.evaluate(async(v:any)=>{
   const t:any=globalThis,transaction=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(...args:any[]){const tx=Reflect.apply(transaction,this,args);if(args[1]==='readwrite')Object.defineProperty(tx,'durability',{value:'relaxed'});return tx;};
   let rejected=false;try{await t.journal.reserveSealIntent(v);}catch{rejected=true;}return {rejected,read:await t.journal.readSealIntent()};
  },seed('nonstrict'));
  check('Unqualified relaxed durability refuses before durable reservation',result.rejected&&result.read===null,result);await c.close();
 }
 {
  const c=await context(),p=await page(c);const result=await p.evaluate(async(v:any)=>{
   const t:any=globalThis,add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(){throw new DOMException('Injected quota refusal','QuotaExceededError');};
   let rejected=false;try{await t.journal.reserveSealIntent(v);}catch{rejected=true;}IDBObjectStore.prototype.add=add;return {rejected,read:await t.journal.readSealIntent()};
  },seed('quota'));
  check('Synchronous native store-add failure refuses and leaves no intent',result.rejected&&result.read===null,result);await c.close();
 }
 {
  const c=await context(),p=await page(c);const result=await p.evaluate(async(v:any)=>{
   const t:any=globalThis;await t.journal.reserveSealIntent(v);const opened=indexedDB.open('umf-products-demo-control',1);const db:IDBDatabase=await new Promise((resolve,reject)=>{opened.onsuccess=()=>resolve(opened.result);opened.onerror=()=>reject(opened.error);});
   await new Promise<void>((resolve,reject)=>{const tx=db.transaction('intents','readwrite',{durability:'strict'});tx.objectStore('intents').put('{malformed','current');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
   let readRejected=false,reserveRejected=false;try{await t.journal.readSealIntent();}catch{readRejected=true;}try{await t.journal.reserveSealIntent(v);}catch{reserveRejected=true;}return {readRejected,reserveRejected};
  },seed('malformed'));
  check('Malformed retained record fails closed on reads and new reservations',result.readRejected&&result.reserveRejected,result);await c.close();
 }
 const report={scope:'Independent actual Chromium IndexedDB execution of transpiled unchanged seal-intent.ts; isolated reviewer origin/context; injected boundary failures are explicit; no Truss/PGlite effect execution or physical power-loss claim',browser:browser.version(),sourceSha256:new Bun.CryptoHasher('sha256').update(source).digest('hex'),javascriptSha256:new Bun.CryptoHasher('sha256').update(javascript).digest('hex'),passed:cases.length,cases,externalRequests:external};writeFileSync(dir+'/journal-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.stop(true);}
