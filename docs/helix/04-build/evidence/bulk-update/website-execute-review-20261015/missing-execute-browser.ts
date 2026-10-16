import {chromium} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/node_modules/playwright';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
const base='/Users/erik/.codex/worktrees/security-action-source-custody/umf';
const root=base+'/docs/helix/05-deploy/microsite/dist';
const out='/private/tmp/umf-bulk-website-review-20261015';
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(r){const path=resolve(root,'.'+new URL(r.url).pathname.replace(/^\/umf(?=\/)/,''));if(!path.startsWith(root+sep))return new Response('Not found',{status:404});const f=Bun.file(path);return await f.exists()?new Response(f):new Response('Not found',{status:404});}});
const origin=`http://127.0.0.1:${server.port}/umf`;const browser=await chromium.launch({headless:true});const cases:any[]=[];const external:string[]=[];
function assert(ok:any,message:string){if(!ok)throw Error(message);}
try{
 for(const command of ['submit','claim']){
  const context=await browser.newContext();
  await context.route('**/*',route=>{const r=route.request();if(!r.url().startsWith(origin+'/')||r.method()!=='GET'){external.push(r.url());return route.abort();}return route.continue();});
  await context.addInitScript(()=>{const g=globalThis as any;g.__posts=[];g.__stopCommand=null;const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message:any,...args:any[]){g.__posts.push(message);if(message.command===g.__stopCommand){g.__stopCommand=null;g.__suppressed=message;throw Error('Independent host interruption after durable reservation, before native dispatch');}return Reflect.apply(original,this,[message,...args]);};});
  const page=await context.newPage();page.setDefaultTimeout(90000);
  const wait=async(text:string)=>await page.waitForFunction(text=>document.querySelector('#store-status')?.textContent===text,text,{timeout:90000});
  const prepare=async()=>{await page.locator('#store-open').click();await wait('Local Truss store opened');await page.locator('#store-register').click();await wait('UPDATE prepared');};
  await page.goto(origin+'/action-compiler.html');await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Portable action plan compiled');await prepare();
  await page.locator('#store-preview').click();await wait('Frozen manifest: 1 items, 1 batches');await page.locator('#store-seal').click();await wait('Seal: sealed');
  if(command==='claim'){await page.locator('#store-submit').click();await wait('Submission: submitted');}
  await page.evaluate(command=>{(globalThis as any).__stopCommand=command;},command);await page.locator('#store-'+command).click();await wait('Response unavailable; original seal intent retained');
  const suppressed=await page.evaluate(()=>(globalThis as any).__suppressed);
  const retained=await page.evaluate(async slot=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('umf-products-demo-control',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise<any>((resolve,reject)=>{const tx=db.transaction('intents');let value:any;const request=tx.objectStore('intents').get('bulk:'+slot);request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(JSON.parse(value));tx.onabort=()=>reject(tx.error);});}finally{db.close();}},command==='submit'?'submit':'claim:0');
  assert(suppressed.command===command&&JSON.stringify(retained.input)===JSON.stringify(suppressed.payload),'Interruption lacked exact prior committed intent');assert(!Object.hasOwn(retained,'outcome'),'Undispatched original control falsely settled');
  cases.push({name:command+': interruption before original native dispatch retains exact committed input',passed:true});
  await page.reload();await prepare();assert(await page.locator('#store-'+command).isDisabled(),'Fresh control enabled after missing original outcome');
  await page.locator('#store-recover-'+command).click();await wait(command==='submit'?'Submission: unresolved':'Claim: unresolved');
  const recovered=JSON.parse((await page.locator('#catalog').textContent())!);assert(recovered.status==='unresolved'&&recovered.code==='not_found'&&recovered.operation===command,'Missing original outcome did not remain unresolved');assert(JSON.stringify(recovered.control)===JSON.stringify(suppressed.payload.control),'Recovery changed original control');
  const posts=await page.evaluate(()=>(globalThis as any).__posts);const recover=posts.find((m:any)=>m.command==='recover-'+command);assert(JSON.stringify(recover.payload)===JSON.stringify(suppressed.payload),'Recovery input changed');assert(!posts.some((m:any)=>m.command===command),'Recovery redispatched missing original');
  cases.push({name:command+': actual original provider missing recovery returns unresolved without original redispatch',passed:true,result:recovered});
  await prepare();assert(await page.locator('#store-'+command).isDisabled(),'Unresolved outcome enabled fresh control');
  await page.locator('#store-'+command).evaluate(el=>el.dispatchEvent(new MouseEvent('click')));await wait('Operation not sent');assert(!(await page.evaluate(()=>(globalThis as any).__posts)).some((m:any)=>m.command===command),'Synthetic disabled-button click bypassed original intent');
  cases.push({name:command+': reopen and forced UI event preserve no-fresh-dispatch fence',passed:true});
  if(command==='claim'){await page.locator('#store-review').click();await wait('Job: queued');const review=JSON.parse((await page.locator('#catalog').textContent())!);assert(review.state.status==='queued'&&review.state.committedBatches===0&&review.state.nextBatch===0,'Missing claim changed original queued job');cases.push({name:'claim: actual job remains queued with zero committed batches',passed:true});}
  await context.close();
 }
 assert(external.length===0,'External or write requests');const names=['action-compiler.js','truss-catalog-worker.js','truss-browser/store.js'];const hashes=Object.fromEntries(await Promise.all(names.map(async p=>[p,createHash('sha256').update(await Bun.file(root+'/'+p).bytes()).digest('hex')])));
 await Bun.write(out+'/missing-recovery-browser.json',JSON.stringify({scope:'Independent actual website and pinned original Truss provider in isolated Chromium contexts; synthetic host interruption only, no engine substitution',browser:browser.version(),passed:cases.length,hashes,externalRequests:external,cases},null,2)+'\n');console.log(JSON.stringify({passed:cases.length,browser:browser.version()}));
}finally{await browser.close();server.stop(true);}
