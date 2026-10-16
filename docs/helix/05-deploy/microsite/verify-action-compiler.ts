import {chromium} from 'playwright';
import {resolve,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dir,'dist');
const server=process.env.UMF_EXPLORER_URL?null:Bun.serve({hostname:'127.0.0.1',port:0,async fetch(r){let path:string;try{path=resolve(root,'.'+decodeURIComponent(new URL(r.url).pathname.replace(/^\/umf(?=\/)/,'')));}catch{return new Response('Invalid path',{status:400});}if(!path.startsWith(root+sep))return new Response('Not found',{status:404});const file=Bun.file(path);return await file.exists()?new Response(file):new Response('Not found',{status:404});}});
const origin=process.env.UMF_EXPLORER_URL??`http://127.0.0.1:${server!.port}/umf`;
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext();let page=await context.newPage();const errors:string[]=[],external:string[]=[],homepageBlockedExternal:string[]=[],writes:string[]=[];let onHomepage=true;page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const r=route.request();if(!r.url().startsWith(origin+'/')){(onHomepage?homepageBlockedExternal:external).push(r.url());return route.abort();}if(r.method()!=='GET'){writes.push(r.method()+' '+r.url());return route.abort();}return route.continue();});
 const instrument=()=>{
  const test=globalThis as any;test.__sealDispatches=[];test.__bulkDispatches=[];
  const originalPost=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(message:any,...args:any[]){if(message?.command==='seal')test.__sealDispatches.push({message,persisted:test.__completedIntent});if(['submit','claim','execute','cancel'].includes(message?.command))test.__bulkDispatches.push({message,persisted:test.__completedIntent});return Reflect.apply(originalPost,this,[message,...args]);};
  const txWrites=new WeakMap<IDBTransaction,unknown>();
  const completion=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete')!;
  Object.defineProperty(IDBTransaction.prototype,'oncomplete',{...completion,set:function(this:IDBTransaction,listener:any){completion.set!.call(this,function(this:IDBTransaction,event:Event){if(txWrites.has(this))test.__completedIntent=txWrites.get(this);listener?.call(this,event);});}});
  const originalAdd=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(value:any,...args:any[]){
   if(this.transaction.db.name==='umf-products-demo-layout02-control'){
    if(test.__denyIntentWrite)throw new DOMException('Injected quota refusal','QuotaExceededError');
    txWrites.set(this.transaction,value);
   }
   return Reflect.apply(originalAdd,this,[value,...args]);
  };
  const descriptor=Object.getOwnPropertyDescriptor(Worker.prototype,'onmessage');if(!descriptor?.set)throw Error('Worker event instrumentation unavailable');
  Object.defineProperty(Worker.prototype,'onmessage',{...descriptor,set:function(this:Worker,listener:any){descriptor.set!.call(this,typeof listener==='function'?function(this:Worker,event:MessageEvent){if(test.__dropCancelAck&&event.data?.result?.status==='cancelled'){test.__dropCancelAck=false;test.__droppedCancel=event.data.result;return;}if(test.__dropBatchAck&&event.data?.result?.status==='committed'){test.__dropBatchAck=false;test.__droppedBatch=event.data.result;return;}if(test.__dropSubmitAck&&event.data?.result?.status==='submitted'){test.__dropSubmitAck=false;test.__droppedSubmit=event.data.result;return;}if(test.__dropClaimAck&&event.data?.result?.status==='claimed'){test.__dropClaimAck=false;test.__droppedClaim=event.data.result;return;}if(test.__dropPreparedAck&&event.data?.result?.outcome==='prepared'){test.__dropPreparedAck=false;test.__droppedPrepared=event.data.result;return;}if(test.__dropSealAck&&event.data?.result?.outcome==='sealed'){test.__dropSealAck=false;test.__droppedSeal=event.data.result;return;}listener.call(this,event);}:listener);}});
 };
 await context.addInitScript(instrument);
 await page.goto(origin+'/index.html');onHomepage=false;
 // A cold module fetch must not expose a clickable store control without a handler.
 let releaseModule!:()=>void;
 const moduleReady=new Promise<void>(resolve=>{releaseModule=resolve;});
 const holdModule=async(route:any)=>{await moduleReady;await route.continue();};
 await context.route('**/action-compiler.js',holdModule);
 const navigation=page.locator('a[href="action-compiler.html"]').click({noWaitAfter:true});
 await page.locator('#store-open').waitFor({state:'attached'});
 const storeInitiallyDisabled=await page.locator('#store-open').isDisabled();
 releaseModule();await navigation;await context.unroute('**/action-compiler.js',holdModule);
 if(!storeInitiallyDisabled)throw Error('Store control enabled before module initialization');
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
 await page.evaluate(()=>{(globalThis as any).__dropPreparedAck=true;});
 await page.locator('#store-register').click();await page.waitForFunction(()=>!!(globalThis as any).__droppedPrepared);
 const registered=await page.evaluate(()=>(globalThis as any).__droppedPrepared);
 if(registered.load.outcome!=='loaded'||registered.load.objects.length!==4||registered.load.journal.length!==4||registered.rows.length!==4)throw Error('Public Truss object loading/reading differs');
 if(registered.outcome!=='prepared'||!['registered','unchanged'].includes(registered.registration)||registered.catalog.types.length!==1||registered.catalog.properties.length!==2||registered.catalog.keys.length!==1)throw Error('Actual catalog registration differs');
 if(['owner','action','grant','readGrant'].some(key=>Object.hasOwn(registered,key)))throw Error('Worker exposed authority capability');
 if(registered.preparationSha256!=='7ee1afaa2b4d24a2d86473341255edf9b11ad266e5d35477126e00504f1975c0'||registered.selectionRead.profile.id!=='umf.actions.local-store-read'||registered.selectionRead.fields.length!==2)throw Error('Original action/read-grant preparation differs');
 if(registered.catalog.document.sourceSha256!=='b8ce3cfe76eeda7c1531b2bbf8aba121c9d9614800ff1f3301f853c048516f27')throw Error('Catalog source differs');
 await page.reload();await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 const loadRecovered=JSON.parse((await page.locator('#catalog').textContent())!);
 if(JSON.stringify(loadRecovered.load)!==JSON.stringify(registered.load)||JSON.stringify(loadRecovered.rows)!==JSON.stringify(registered.rows))throw Error('Lost public load acknowledgement changed original receipt or data');
 const second=await page.context().newPage();await second.goto(origin+'/action-compiler.html');await second.locator('#store-open').click();
 await second.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store is in use in another tab');
 await page.locator('#store-close').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store closed');
 await page.reload();await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 const reopened=JSON.parse((await page.locator('#catalog').textContent())!);
 if(reopened.info.storeId!==opened.info.storeId||reopened.info.incarnation!==opened.info.incarnation||JSON.stringify(reopened.catalog)!==JSON.stringify(registered.catalog))throw Error('Catalog or incarnation changed on reopen');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 const reissued=JSON.parse((await page.locator('#catalog').textContent())!);if(JSON.stringify(reissued.load)!==JSON.stringify(registered.load)||JSON.stringify(reissued.rows)!==JSON.stringify(registered.rows))throw Error('Public load replay or persisted rows differ');if(reissued.preparationSha256!==registered.preparationSha256||JSON.stringify(reissued.selectionRead)!==JSON.stringify(registered.selectionRead))throw Error('Reopened action/read preparation differs');
 await page.locator('#store-close').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store closed');
 // Production public loading persists four original sample products and replays across reopen.
 await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 await page.locator('#sql').fill("UPDATE products SET name = 'Bulk' WHERE name = 'Sample'");
 await page.locator('#store-preview').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Frozen manifest: 3 items, 2 batches');
 const materialized=JSON.parse((await page.locator('#catalog').textContent())!);
 if(JSON.parse(materialized.plan.utf8).inputs.assignments[0].value.string!=='Bulk')throw Error('Engine-owned compiler differs from bulk UPDATE');
 if(materialized.count!==3||JSON.parse(materialized.manifest.utf8).items.length!==3||JSON.stringify(materialized.batches.map((b:any)=>b.count))!=='[2,1]'||['work','owner','action','grant'].some(key=>Object.hasOwn(materialized,key)))throw Error('Three-row native materialization/custody differs');
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
 page=second;
 await page.evaluate(()=>{(globalThis as any).__denyIntentWrite=true;});await page.locator('#store-submit').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Operation not sent');
 if(await page.evaluate(()=>(globalThis as any).__bulkDispatches.length)!==0)throw Error('Bulk dispatched before refused journal write');
 await page.evaluate(()=>{(globalThis as any).__denyIntentWrite=false;(globalThis as any).__dropSubmitAck=true;});await page.locator('#store-submit').click();await page.waitForFunction(()=>!!(globalThis as any).__droppedSubmit);
 const submitted=await page.evaluate(()=>({outcome:(globalThis as any).__droppedSubmit,dispatch:(globalThis as any).__bulkDispatches[0]}));
 const submitIntent=JSON.parse(submitted.dispatch.persisted);
 if(submitIntent.slot!=='submit'||JSON.stringify(submitIntent.input)!==JSON.stringify(submitted.dispatch.message.payload)||submitted.outcome.state.status!=='queued')throw Error('Original submission input not committed before dispatch');
 await page.reload();await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 if(await page.locator('#store-submit').isEnabled())throw Error('Pending submission permits fresh dispatch');
 await page.locator('#store-recover-submit').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Submission: submitted');
 if(JSON.stringify(JSON.parse((await page.locator('#catalog').textContent())!))!==JSON.stringify(submitted.outcome))throw Error('Submission recovery changed original sampled outcome');
 await page.evaluate(()=>{(globalThis as any).__dropClaimAck=true;});await page.locator('#store-claim').click();await page.waitForFunction(()=>!!(globalThis as any).__droppedClaim);
 const claimed=await page.evaluate(()=>({outcome:(globalThis as any).__droppedClaim,dispatch:(globalThis as any).__bulkDispatches[0]}));
 const claimIntent=JSON.parse(claimed.dispatch.persisted);
 if(claimIntent.slot!=='claim:0'||JSON.stringify(claimIntent.input)!==JSON.stringify(claimed.dispatch.message.payload)||claimed.outcome.fence!=='1')throw Error('Original claim input not committed before dispatch');
 await page.reload();await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 if(await page.locator('#store-claim').isEnabled())throw Error('Pending claim permits fresh dispatch');
 await page.locator('#store-recover-claim').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Claim: claimed');
 if(JSON.stringify(JSON.parse((await page.locator('#catalog').textContent())!))!==JSON.stringify(claimed.outcome))throw Error('Claim recovery changed original fence or lease');
 await page.locator('#store-review').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Job: running');
 const job=JSON.parse((await page.locator('#catalog').textContent())!);
 if(job.state.committedBatches!==0||job.state.nextBatch!==0||job.manifest.utf8!==recovered.manifest.utf8)throw Error('Claim executed or changed original manifest');
 await page.evaluate(()=>{(globalThis as any).__denyIntentWrite=true;});await page.locator('#store-execute').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Operation not sent');
 if(await page.evaluate(()=>(globalThis as any).__bulkDispatches.length)!==0)throw Error('Execution dispatched before refused intent write');
 await page.evaluate(()=>{(globalThis as any).__denyIntentWrite=false;(globalThis as any).__dropBatchAck=true;});await page.locator('#store-execute').click();await page.waitForFunction(()=>!!(globalThis as any).__droppedBatch);
 const firstBatch=await page.evaluate(()=>({outcome:(globalThis as any).__droppedBatch,dispatch:(globalThis as any).__bulkDispatches[0]}));
 if(firstBatch.outcome.batch!==0||firstBatch.outcome.items.length!==2||JSON.stringify(JSON.parse(firstBatch.dispatch.persisted).input)!==JSON.stringify(firstBatch.dispatch.message.payload))throw Error('Original execute input or actual first batch differs');
 await page.reload();await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 if(await page.locator('#store-execute').isEnabled()||await page.locator('#store-claim').isEnabled())throw Error('Lost execution response allowed fresh dispatch');
 await page.locator('#store-recover-execute').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Batch: committed');
 if(JSON.stringify(JSON.parse((await page.locator('#catalog').textContent())!))!==JSON.stringify(firstBatch.outcome))throw Error('Batch recovery changed original items/receipt');
 await page.locator('#store-claim').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Claim: claimed');
 const secondClaim=JSON.parse((await page.locator('#catalog').textContent())!);if(secondClaim.batch!==1)throw Error('Next claim did not use fresh authoritative progress');
 await page.locator('#store-execute').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Batch: committed');
 const secondBatch=JSON.parse((await page.locator('#catalog').textContent())!);if(secondBatch.batch!==1||secondBatch.items.length!==1)throw Error('Final batch differs');
 const changedRows=JSON.parse((await page.locator('#stored-products').textContent())!);
 if(changedRows.length!==4)throw Error('Actual Truss object count differs');
 for(const row of changedRows){const id=row.fields.find((field:any)=>field.field==='product-id')?.value,name=row.fields.find((field:any)=>field.field==='product-name')?.value,original=registered.rows.find((item:any)=>item.id===row.id);
  if(!original||name!==(id==='spare'?'Untouched':'Bulk')||BigInt(row.version)!==BigInt(original.version)+(id==='spare'?0n:1n))throw Error('Native data/version or untouched row differs');}
 for(const item of [...firstBatch.outcome.items,...secondBatch.items])if(item.result.noOp||item.result.changes.length!==1||!item.result.verification.requiredEffects||!item.result.verification.frame||!item.result.verification.keysUnchanged)throw Error('Original per-item result/verification differs');
 await page.locator('#store-recover-execute').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Batch: committed');
 if(JSON.stringify(JSON.parse((await page.locator('#catalog').textContent())!))!==JSON.stringify(secondBatch)||JSON.stringify(JSON.parse((await page.locator('#stored-products').textContent())!))!==JSON.stringify(changedRows))throw Error('Batch replay changed original result/data');
 await page.locator('#store-review').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Job: completed');
 const completed=JSON.parse((await page.locator('#catalog').textContent())!);if(completed.state.committedBatches!==2||completed.state.nextBatch!==2||completed.manifest.utf8!==recovered.manifest.utf8)throw Error('Completed job progress or manifest differs');
 await page.locator('#store-history').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='History: 5 events');
 const historyFirst=JSON.parse((await page.locator('#history').textContent())!);
 await page.locator('#store-next-history').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='History: 2 events');
 const historySecond=JSON.parse((await page.locator('#history').textContent())!),events=[...historyFirst.events,...historySecond.events];
 if(!historyFirst.hasMore||historySecond.hasMore||events.filter((event:any)=>event.operation==='create').length!==4||events.filter((event:any)=>event.operation==='property').length!==3)throw Error('Actual public history event count differs');
 if(historyFirst.events.at(-1).context.batch!==0||historySecond.events[0].context.batch!==0||historyFirst.events.at(-1).transactionId!==historySecond.events[0].transactionId)throw Error('History did not preserve committed batch across row pages');
 let sequence=0n;for(const event of events){if(BigInt(event.sequence)<=sequence)throw Error('History order differs');sequence=BigInt(event.sequence);for(const artifact of [event.event,event.origin])if(createHash('sha256').update(artifact.utf8).digest('hex')!==artifact.sha256)throw Error('Original history artifact bytes differ');}
 await page.locator('#store-close').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store closed');
 await page.locator('#store-open').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await page.locator('#store-register').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');
 await page.locator('#store-next-history').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='History: 0 events');
 if(JSON.stringify(JSON.parse((await page.locator('#history').textContent())!).cursor)!==JSON.stringify(historySecond.cursor))throw Error('History tail changed after reopen');

 await page.locator('#store-close').click();await page.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Store closed');
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 if(errors.length||external.length||writes.length)throw Error(JSON.stringify({errors,external,writes}));
 await page.screenshot({path:join(tmpdir(),'umf-browser-action-compiler-20261015.png'),fullPage:true});
 // Explicit host failure injection after committed load admission but before native dispatch.
 // A fresh page must recover absence, rather than create products under the old attempt.
 const interrupted=await browser.newContext();let interruptLoad=true;
 await interrupted.route('**/*',async route=>{
  const request=route.request();if(!request.url().startsWith(origin+'/')||request.method()!=='GET')throw Error('Unexpected interruption-test request');
  if(interruptLoad&&request.url().endsWith('/truss-catalog-worker.js')){
   interruptLoad=false;const original=await Bun.file(join(root,'truss-catalog-worker.js')).text();
   const call='await current.store.loadObjects(current.owner, loadInput)';
   if(!original.includes(call))throw Error('Load interruption boundary unavailable');
   return route.fulfill({contentType:'text/javascript',body:original.replace(call,'(()=>{throw Error("Injected interruption after load reservation");})()')});
  }
  return route.continue();
 });
 const interruptedPage=await interrupted.newPage();await interruptedPage.goto(origin+'/action-compiler.html');
 await interruptedPage.locator('#store-open').click();await interruptedPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await interruptedPage.locator('#store-register').click();await interruptedPage.waitForFunction(()=>document.querySelector('#catalog')?.textContent?.includes('Injected interruption after load reservation'));
 await interruptedPage.reload();await interruptedPage.locator('#store-open').click();await interruptedPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');
 await interruptedPage.locator('#store-register').click();await interruptedPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Sample loading requires recovery; original request retained');
 const absent=JSON.parse((await interruptedPage.locator('#catalog').textContent())!);
 if(absent.load.outcome!=='unresolved'||absent.load.code!=='not_found'||await interruptedPage.locator('#store-preview').isEnabled())throw Error('Missing load recovery redispatched or allowed preparation');
 await interrupted.close();
 // Explicit interruption after the strict host execute reservation, before native admission.
 const missingBatch=await browser.newContext();let interruptBatch=true;
 await missingBatch.route('**/*',async route=>{
  const request=route.request();if(!request.url().startsWith(origin+'/')||request.method()!=='GET')throw Error('Unexpected missing-batch request');
  if(interruptBatch&&request.url().endsWith('/truss-catalog-worker.js')){
   interruptBatch=false;const original=await Bun.file(join(root,'truss-catalog-worker.js')).text(),call='await current.store.executeBatch(current.owner, action, readGrant, payload)';
   if(!original.includes(call))throw Error('Execute interruption boundary unavailable');
   return route.fulfill({contentType:'text/javascript',body:original.replace(call,'(()=>{throw Error("Injected interruption after execute reservation");})()')});
  }
  return route.continue();
 });
 const missingPage=await missingBatch.newPage();await missingPage.goto(origin+'/action-compiler.html');
 async function openMissing(){await missingPage.locator('#store-open').click();await missingPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');await missingPage.locator('#store-register').click();await missingPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');}
 await openMissing();
 for(const [command,status] of [['preview','Frozen manifest: 1 items, 1 batches'],['seal','Seal: sealed'],['submit','Submission: submitted'],['claim','Claim: claimed']]){await missingPage.locator('#store-'+command).click();await missingPage.waitForFunction(expected=>document.querySelector('#store-status')?.textContent===expected,status);}
 await missingPage.locator('#store-execute').click();await missingPage.waitForFunction(()=>document.querySelector('#catalog')?.textContent?.includes('Injected interruption after execute reservation'));
 await missingPage.reload();await openMissing();
 if(await missingPage.locator('#store-execute').isEnabled()||await missingPage.locator('#store-claim').isEnabled())throw Error('Missing batch outcome permitted fresh execution/claim');
 await missingPage.locator('#store-recover-execute').click();await missingPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Batch: indeterminate');
 await openMissing();
 const stillOriginal=JSON.parse((await missingPage.locator('#stored-products').textContent())!);
 if(stillOriginal.length!==4||stillOriginal.some((row:any)=>row.version!=='1'||row.fields.some((field:any)=>field.field==='product-name'&&!['Sample','Untouched'].includes(field.value))))throw Error('Missing batch recovery redispatched effects');
 await missingPage.locator('#store-review').click();await missingPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Job: running');
 if(JSON.parse((await missingPage.locator('#catalog').textContent())!).state.committedBatches!==0)throw Error('Missing batch recovery advanced progress');
 await missingBatch.close();
 const cancellation=await browser.newContext();await cancellation.addInitScript(instrument);
 await cancellation.route('**/*',route=>{if(!route.request().url().startsWith(origin+'/')||route.request().method()!=='GET')throw Error('Unexpected cancellation-test request');return route.continue();});
 const cancelPage=await cancellation.newPage();await cancelPage.goto(origin+'/action-compiler.html');
 async function openCancel(){await cancelPage.locator('#store-open').click();await cancelPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Local Truss store opened');await cancelPage.locator('#store-register').click();await cancelPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='UPDATE prepared');}
 await openCancel();
 for(const [command,status] of [['preview','Frozen manifest: 1 items, 1 batches'],['seal','Seal: sealed'],['submit','Submission: submitted']]){await cancelPage.locator('#store-'+command).click();await cancelPage.waitForFunction(expected=>document.querySelector('#store-status')?.textContent===expected,status);}
 await cancelPage.evaluate(()=>{(globalThis as any).__dropCancelAck=true;});await cancelPage.locator('#store-cancel').click();await cancelPage.waitForFunction(()=>!!(globalThis as any).__droppedCancel);
 const cancelled=await cancelPage.evaluate(()=>({outcome:(globalThis as any).__droppedCancel,dispatch:(globalThis as any).__bulkDispatches.find((item:any)=>item.message.command==='cancel')}));
 if(JSON.stringify(JSON.parse(cancelled.dispatch.persisted).input)!==JSON.stringify(cancelled.dispatch.message.payload))throw Error('Cancellation dispatched before strict original intent');
 await cancelPage.reload();await openCancel();
 if(await cancelPage.locator('#store-cancel').isEnabled()||await cancelPage.locator('#store-claim').isEnabled()||await cancelPage.locator('#store-execute').isEnabled())throw Error('Cancelled or pending control allowed fresh dispatch');
 await cancelPage.locator('#store-recover-cancel').click();await cancelPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Cancellation: cancelled');
 if(JSON.stringify(JSON.parse((await cancelPage.locator('#catalog').textContent())!))!==JSON.stringify(cancelled.outcome))throw Error('Cancellation recovery changed original sampled result');
 await cancelPage.evaluate(()=>document.querySelector('#store-claim')!.dispatchEvent(new Event('click')));await cancelPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='Operation not sent');
 if(await cancelPage.evaluate(()=>(globalThis as any).__bulkDispatches.length)!==0)throw Error('Cancelled work dispatched a fresh mutation control');
 await cancelPage.locator('#store-history').click();await cancelPage.waitForFunction(()=>document.querySelector('#store-status')?.textContent==='History: 4 events');
 if(JSON.parse((await cancelPage.locator('#history').textContent())!).events.some((event:any)=>event.operation!=='create'))throw Error('Cancelled work produced business effects');
 await cancellation.close();
 const hashes:Record<string,string>={};
 for(const path of ['index.html','action-compiler.html','action-compiler.js','action-compiler/model.json','action-compiler/weft_wasm_bg.wasm','action-compiler/weft_wasm.js','truss-catalog-worker.js','truss-browser/store.js','truss-browser/manifest.json','truss-browser/layout.sql','truss-browser/model.json']){const response=await page.request.get(origin+'/'+path);if(!response.ok())throw Error('Asset unavailable: '+path);hashes[path]=createHash('sha256').update(await response.body()).digest('hex');}
 for(const path of ['docs/helix/05-deploy/microsite/verify-action-compiler.ts','docs/helix/05-deploy/microsite/build-action-compiler.ts','docs/helix/05-deploy/microsite/action-compiler.ts','docs/helix/05-deploy/microsite/seal-intent.ts','docs/helix/05-deploy/microsite/load-intent.ts','docs/helix/05-deploy/microsite/bulk-intent.ts','docs/helix/05-deploy/microsite/truss-catalog-worker.ts','docs/helix/05-deploy/microsite/build-truss-browser.ts','docs/helix/03-test/fixtures/bulk-update/local-products-input.json','docs/helix/03-test/fixtures/bulk-update/local-products-model.json','docs/helix/05-deploy/microsite/assets/weft-local-mutation/provenance.json'])hashes[path]=createHash('sha256').update(new Uint8Array(await Bun.file(resolve(import.meta.dir,'../../../..',path)).arrayBuffer())).digest('hex');
 const report={hashes,scope:'GitHub Pages-compatible local-profile Weft WASM compilation entirely in browser; unchanged example data; actual Truss catalog/grants, public four-object loading/replay, three-row [2,1] materialization and seal recovery after dropped acknowledgement; durable keyed submission/claim and exact ACK-loss recovery; actual three-row [2,1] UPDATE execution, original item receipts/replay/reopen recovery; bounded original committed history row pages and cancellation/recovery; lifetime-of-store-incarnation retention; no full local-bulk/native904 qualification',browser:browser.version(),passed:true,catalogRegistration:true,catalogReopen:true,secondTabExclusion:true,actionReadPreparation:true,publicDataLoading:true,loadReplay:true,loadAckLossRecovery:true,loadMissingRecoveryNoRedispatch:true,threeRowMaterialization:true,submitClaimCustody:true,submitAckLossRecovery:true,claimAckLossRecovery:true,actualBatchExecution:true,executeAckLossRecovery:true,executeMissingRecoveryNoRedispatch:true,executionReplay:true,completedTwoBatches:true,untouchedFourthRow:true,publicHistory:true,splitBatchPages:true,historyReopen:true,cancelAckLossRecovery:true,cancelledNoEffects:true,persistBeforeSeal:true,quotaRefusalBeforeDispatch:true,lostSealAckRecovery:true,existingTabTakeover:true,refusals:3,unicode:true,mobile:true,homepageBlockedExternalRequests:homepageBlockedExternal,externalRequests:external,writeRequests:writes};
 await Bun.write(new URL('../../04-build/evidence/bulk-update/website-compiler-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close();server?.stop(true);}
