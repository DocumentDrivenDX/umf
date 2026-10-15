import {chromium} from 'playwright';
import {resolve,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dir,'dist');
const server=process.env.UMF_EXPLORER_URL?null:Bun.serve({hostname:'127.0.0.1',port:0,async fetch(r){let path:string;try{path=resolve(root,'.'+decodeURIComponent(new URL(r.url).pathname.replace(/^\/umf(?=\/)/,'')));}catch{return new Response('Invalid path',{status:400});}if(!path.startsWith(root+sep))return new Response('Not found',{status:404});const file=Bun.file(path);return await file.exists()?new Response(file):new Response('Not found',{status:404});}});
const origin=process.env.UMF_EXPLORER_URL??`http://127.0.0.1:${server!.port}/umf`;
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext();let page=await context.newPage();const errors:string[]=[],external:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const r=route.request();if(!r.url().startsWith(origin+'/')){external.push(r.url());return route.abort();}if(r.method()!=='GET'){writes.push(r.method()+' '+r.url());return route.abort();}return route.continue();});
 await page.addInitScript(()=>{
  const test=globalThis as any;test.__sealDispatches=[];
  const originalPost=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(message:any,...args:any[]){if(message?.command==='seal')test.__sealDispatches.push({message,persisted:test.__completedIntent});return Reflect.apply(originalPost,this,[message,...args]);};
  const txWrites=new WeakMap<IDBTransaction,unknown>();
  const completion=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete')!;
  Object.defineProperty(IDBTransaction.prototype,'oncomplete',{...completion,set:function(this:IDBTransaction,listener:any){completion.set!.call(this,function(this:IDBTransaction,event:Event){if(txWrites.has(this))test.__completedIntent=txWrites.get(this);listener?.call(this,event);});}});
  const originalAdd=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(value:any,...args:any[]){
   if(this.transaction.db.name==='umf-products-demo-control'){
    if(test.__denyIntentWrite)throw new DOMException('Injected quota refusal','QuotaExceededError');
    txWrites.set(this.transaction,value);
   }
   return Reflect.apply(originalAdd,this,[value,...args]);
  };
  const descriptor=Object.getOwnPropertyDescriptor(Worker.prototype,'onmessage');if(!descriptor?.set)throw Error('Worker event instrumentation unavailable');
  Object.defineProperty(Worker.prototype,'onmessage',{...descriptor,set:function(this:Worker,listener:any){descriptor.set!.call(this,typeof listener==='function'?function(this:Worker,event:MessageEvent){if(test.__dropSealAck&&event.data?.result?.outcome==='sealed'){test.__dropSealAck=false;test.__droppedSeal=event.data.result;return;}listener.call(this,event);}:listener);}});
 });
 await page.goto(origin+'/action-compiler.html');
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Loading compiler…');
 if(await page.locator('#status').textContent()!=='Portable action plan compiled')throw Error(JSON.stringify({status:await page.locator('#status').textContent(),output:await page.locator('#plan').textContent(),errors,external,writes}));
 const samples=await page.locator('#samples').textContent();
 const plan=JSON.parse((await page.locator('#plan').textContent())!);
 if(plan.protocol!=='umf.actions.plan/1'||plan.inputs.assignments[0].value.string!=='Foo')throw Error('Wrong original portable plan');
 if(plan.action.invocation.id!=='umf.actions.local-tx'||plan.model.sha256!=='b8ce3cfe76eeda7c1531b2bbf8aba121c9d9614800ff1f3301f853c048516f27')throw Error('Wrong local compiler cohort');
 if(plan.model.revision!==plan.model.sha256)throw Error('Demo model revision differs from native accepted content revision');
 for(const sql of ["UPDATE products SET id = 'oops' WHERE id = 'bar'",'UPDATE products SET name = NULL WHERE id = \'bar\'',"UPDATE products SET name = 'Foo'"]){
  await page.locator('#sql').fill(sql);await page.locator('#compile').click();
  if(await page.locator('#status').textContent()!=='Statement refused')throw Error('Unsupported statement accepted');
 }
 await page.locator('#sql').fill("UPDATE products SET name = 'Unicode 😀' WHERE id = 'baz'");await page.locator('#compile').click();
 if(await page.locator('#status').textContent()!=='Portable action plan compiled')throw Error('Unicode failed');
 if(await page.locator('#samples').textContent()!==samples)throw Error('Compilation changed sample rows');
 await page.locator('#store-open').click();
 await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 const opened=JSON.parse((await page.locator('#catalog').textContent())!);
 await page.locator('#store-register').click();
 await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 const registered=JSON.parse((await page.locator('#catalog').textContent())!);
 if(registered.outcome!=='prepared'||!['registered','unchanged'].includes(registered.registration)||registered.catalog.types.length!==1||registered.catalog.properties.length!==2||registered.catalog.keys.length!==1)throw Error('Actual catalog registration differs');
 if(['owner','action','grant','readGrant'].some(key=>Object.hasOwn(registered,key)))throw Error('Worker exposed authority capability');
 if(registered.preparationSha256!=='6f5e69462c327da970f07ca1f6253dbacc4db0badf1335b7d91e3f38eb67ad40'||registered.selectionRead.profile.id!=='umf.actions.local-store-read'||registered.selectionRead.fields.length!==2)throw Error('Original action/read-grant preparation differs');
 if(registered.catalog.document.sourceSha256!=='b8ce3cfe76eeda7c1531b2bbf8aba121c9d9614800ff1f3301f853c048516f27')throw Error('Catalog source differs');
 await page.locator('#store-register').click();
 await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 const second=await page.context().newPage();await second.goto(origin+'/action-compiler.html');await second.locator('#store-open').click();
 await second.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store is in use in another tab');
 await page.locator('#store-close').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store closed');
 await page.reload();await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 const reopened=JSON.parse((await page.locator('#catalog').textContent())!);
 if(reopened.info.storeId!==opened.info.storeId||reopened.info.incarnation!==opened.info.incarnation||JSON.stringify(reopened.catalog)!==JSON.stringify(registered.catalog))throw Error('Catalog or incarnation changed on reopen');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 const reissued=JSON.parse((await page.locator('#catalog').textContent())!);if(reissued.preparationSha256!==registered.preparationSha256||JSON.stringify(reissued.selectionRead)!==JSON.stringify(registered.selectionRead))throw Error('Reopened action/read preparation differs');
 await page.locator('#store-close').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store closed');
 // Public bootstrap is not implemented: this real store is empty, rather than administratively seeded.
 await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 await page.locator('#store-preview').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Frozen manifest: 0 items, 0 batches');
 const materialized=JSON.parse((await page.locator('#catalog').textContent())!);
 if(materialized.plan.sha256!=='bdb85e7964878ea94041aa738ffa6aa3cdc07280b92dd971c03860143ec1e57f')throw Error('Engine-owned compiler differs from original default plan');
 if(materialized.count!==0||JSON.parse(materialized.manifest.utf8).items.length!==0||['work','owner','action','grant'].some(key=>Object.hasOwn(materialized,key)))throw Error('Empty native materialization/custody differs');
 await page.evaluate(()=>{(globalThis as any).__denyIntentWrite=true;});await page.locator('#store-seal').click();
 await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Operation not sent');
 if(await page.evaluate(()=>(globalThis as any).__sealDispatches.length)!==0)throw Error('Seal dispatched before failed persistence');
 await page.evaluate(()=>{(globalThis as any).__denyIntentWrite=false;(globalThis as any).__dropSealAck=true;});await page.locator('#store-seal').click();
 await page.waitForFunction(()=>!!(globalThis as any).__droppedSeal);
 const lost=await page.evaluate(()=>({outcome:(globalThis as any).__droppedSeal,dispatch:(globalThis as any).__sealDispatches[0],pending:JSON.parse((globalThis as any).__completedIntent)}));
 const before=JSON.parse(lost.dispatch.persisted);
 if(before.phase!=='pending'||before.reference.requestKey!==lost.dispatch.message.payload.requestKey||before.reference.attempt!==lost.dispatch.message.payload.attempt||before.reference.manifestSha256!==materialized.manifest.sha256||lost.pending.phase!=='pending')throw Error('Original intent not durably captured before dispatch/lost acknowledgement');
 await page.close();
 await second.locator('#store-open').click();await second.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await second.locator('#store-register').click();await second.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 if(await second.locator('#store-preview').isEnabled()||await second.locator('#store-seal').isEnabled())throw Error('Existing second tab allowed fresh work after takeover');
 await second.locator('#store-recover').click();await second.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Seal: sealed');
 const recovered=JSON.parse((await second.locator('#catalog').textContent())!);
 if(recovered.receipt.utf8!==lost.outcome.receipt.utf8||recovered.manifest.utf8!==lost.outcome.manifest.utf8||JSON.stringify(recovered.reference)!==JSON.stringify(lost.outcome.reference))throw Error('Original seal recovery changed retained bytes/reference');
 await second.locator('#store-close').click();await second.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store closed');
 page=second;
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 if(errors.length||external.length||writes.length)throw Error(JSON.stringify({errors,external,writes}));
 await page.screenshot({path:join(tmpdir(),'umf-browser-action-compiler-20261015.png'),fullPage:true});
 const hashes:Record<string,string>={};
 for(const path of ['action-compiler.html','action-compiler.js','action-compiler/model.json','action-compiler/weft_wasm_bg.wasm','action-compiler/weft_wasm.js','truss-catalog-worker.js','truss-browser/store.js','truss-browser/manifest.json','truss-browser/layout.sql','truss-browser/model.json']){const response=await page.request.get(origin+'/'+path);if(!response.ok())throw Error('Asset unavailable: '+path);hashes[path]=createHash('sha256').update(await response.body()).digest('hex');}
 for(const path of ['docs/helix/05-deploy/microsite/verify-action-compiler.ts','docs/helix/05-deploy/microsite/build-action-compiler.ts','docs/helix/05-deploy/microsite/action-compiler.ts','docs/helix/05-deploy/microsite/seal-intent.ts','docs/helix/05-deploy/microsite/truss-catalog-worker.ts','docs/helix/05-deploy/microsite/build-truss-browser.ts','docs/helix/03-test/fixtures/bulk-update/local-products-input.json','docs/helix/03-test/fixtures/bulk-update/local-products-model.json','docs/helix/05-deploy/microsite/assets/weft-local-mutation/provenance.json'])hashes[path]=createHash('sha256').update(new Uint8Array(await Bun.file(resolve(import.meta.dir,'../../../..',path)).arrayBuffer())).digest('hex');
 const report={hashes,scope:'GitHub Pages-compatible local-profile Weft WASM compilation entirely in browser; unchanged example data; actual Truss catalog/grants, empty-store materialization and seal recovery after dropped acknowledgement; no public data bootstrap or execution',browser:browser.version(),passed:true,catalogRegistration:true,catalogReopen:true,secondTabExclusion:true,actionReadPreparation:true,emptyMaterialization:true,persistBeforeSeal:true,quotaRefusalBeforeDispatch:true,lostSealAckRecovery:true,existingTabTakeover:true,refusals:3,unicode:true,mobile:true,externalRequests:external,writeRequests:writes};
 await Bun.write(new URL('../../04-build/evidence/bulk-update/website-compiler-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close();server?.stop(true);}
