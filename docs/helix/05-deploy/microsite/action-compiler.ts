import {readBulkIntents,reserveBulkIntent,settleBulkIntent,type BulkIntent} from './bulk-intent';
import {readSealIntent,reserveSealIntent,settleSealIntent,type SealIntent as Intent} from './seal-intent';
// The browser transports requests; original Rust WASM owns SQL/model/action semantics.
const sql=document.querySelector<HTMLTextAreaElement>('#sql')!;
const status=document.querySelector<HTMLElement>('#status')!;
const output=document.querySelector<HTMLElement>('#plan')!;
const run=document.querySelector<HTMLButtonElement>('#compile')!;
try {
 const data=await fetch('./action-compiler/model.json').then(r=>{if(!r.ok)throw Error('Model unavailable');return r.json();});
 // Host-owned static module URL; metadata cannot install executable code.
 const module=await import(/* @vite-ignore */ './action-compiler/weft_wasm.js');
 await module.default();
 const compiler=new module.MutationCompiler(JSON.stringify(data.configuration));
 sql.value=data.request.sql;
 document.querySelector('#samples')!.textContent=JSON.stringify(data.samples,null,2);
 function compile(){try{const response=JSON.parse(compiler.compile_json(JSON.stringify({...data.request,sql:sql.value})));
 status.textContent=response.status==='compiled'?'Portable action plan compiled':'Statement refused';
 output.textContent=response.status==='compiled'?JSON.stringify(JSON.parse(response.plan.utf8),null,2):JSON.stringify(response.diagnostics,null,2);
 }catch(error){status.textContent='Compilation unavailable';output.textContent=error instanceof Error?error.message:String(error);}}
 run.disabled=false;run.addEventListener('click',compile);compile();
}catch(error){status.textContent='Compiler unavailable';output.textContent=error instanceof Error?error.message:String(error);}

// Every capability and frozen-work handle remains in the dedicated worker.
const openStore=document.querySelector<HTMLButtonElement>('#store-open')!;
const registerStore=document.querySelector<HTMLButtonElement>('#store-register')!;
const closeStore=document.querySelector<HTMLButtonElement>('#store-close')!;
const previewStore=document.querySelector<HTMLButtonElement>('#store-preview')!;
const sealStore=document.querySelector<HTMLButtonElement>('#store-seal')!;
const recoverStore=document.querySelector<HTMLButtonElement>('#store-recover')!;
const bulkButtons=Object.fromEntries(['submit','recover-submit','claim','recover-claim','review'].map(name=>[name,document.querySelector<HTMLButtonElement>('#store-'+name)!]));
let bulkIntents:Record<string,BulkIntent>={};
function submittedJob(){const result=bulkIntents.submit?.outcome as any;return result?.status==='submitted'?result.state.job:null;}
function bulkContext(){if(!intent)throw Error('Original seal intent required');return JSON.stringify(intent.reference);}
const storeStatus=document.querySelector<HTMLElement>('#store-status')!;
const catalogOutput=document.querySelector<HTMLElement>('#catalog')!;
let intent:Intent|null=null,intentError='Intent journal not yet read',preview:any=null;
async function refreshIntent(){
 try{const retained=await readSealIntent();if(intent&&!retained)throw Error('Original intent unexpectedly missing');intent=retained;bulkIntents=await readBulkIntents();if(Object.values(bulkIntents).some(record=>record.context!==bulkContext()))throw Error('Bulk intent belongs to another original seal');intentError='';if(intent)preview=null;}
 catch(error){intentError=error instanceof Error?error.message:String(error);throw error;}
}
const intentChannel=new BroadcastChannel('umf-products-demo-control');
intentChannel.onmessage=()=>{void refreshIntent().catch(()=>{}).finally(buttons);};
let worker:Worker|undefined,sequence=0,available=false,prepared=false,busy=false;
let waiting:{id:number;resolve:(value:any)=>void;reject:(error:Error)=>void}|undefined;
function buttons(){
 openStore.disabled=busy||available;registerStore.disabled=closeStore.disabled=busy||!available;
 previewStore.disabled=busy||!prepared||!!intent||!!intentError;
 sealStore.disabled=busy||!prepared||!preview||!!intent||!!intentError;
 recoverStore.disabled=busy||!prepared||!intent||!!intentError;
 const blocked=busy||!prepared||!!intentError;
 bulkButtons.submit!.disabled=blocked||intent?.outcome?.outcome!=='sealed'||!!bulkIntents.submit;
 bulkButtons['recover-submit']!.disabled=blocked||!bulkIntents.submit;
 bulkButtons.claim!.disabled=blocked||!submittedJob()||!!bulkIntents['claim:0'];
 bulkButtons['recover-claim']!.disabled=blocked||!bulkIntents['claim:0'];
 bulkButtons.review!.disabled=blocked||!submittedJob();
}
function requestStore(command:string,payload?:unknown):Promise<any>{
 if(waiting)throw Error('Store request already pending');
 if(!worker){
  worker=new Worker(new URL('./truss-catalog-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{if(waiting&&event.data.id===waiting.id){const current=waiting;waiting=undefined;event.data.error?current.reject(new Error(event.data.error)):current.resolve(event.data.result);}};
  worker.onerror=event=>{const current=waiting;waiting=undefined;current?.reject(new Error(event.message));detach();buttons();};
 }
 return new Promise((resolve,reject)=>{waiting={id:++sequence,resolve,reject};worker!.postMessage({id:sequence,command,payload});});
}
function detach(){worker?.terminate();worker=undefined;available=false;prepared=false;preview=null;}
async function localOperation(command:string){
 let payload:unknown,bulkRecord:BulkIntent|undefined;
 if(busy)return;busy=true;buttons();
 try{
  await refreshIntent();
  if(command==='preview'){if(intent||intentError)throw Error('Original seal intent must be reconciled');payload={sql:sql.value};}
  if(command==='seal'){
   if(!preview||intent||intentError)throw Error('Fresh materialization and available intent storage required');
   const reference={profile:'truss-browser-seal-reference/0.1' as const,storeId:preview.sealContext.storeId,incarnation:preview.sealContext.incarnation,modelSha256:preview.sealContext.modelSha256,requestKey:crypto.randomUUID(),attempt:crypto.randomUUID(),manifestSha256:preview.manifest.sha256,planSha256:preview.plan.sha256};
   const pending:Intent={profile:'umf.demo.seal-intent/1',reference,input:preview.input,phase:'pending'};
   // Strict atomic journal transaction must complete before dispatch.
   await reserveSealIntent(pending);intent=pending;intentChannel.postMessage({changed:true});
   payload={requestKey:reference.requestKey,attempt:reference.attempt};
  }
  if(command==='recover'){if(!intent)throw Error('Original seal intent required');payload={reference:intent.reference};}
  if(command==='submit'||command==='claim'){
   const slot=command==='submit'?'submit':'claim:0';
   if(bulkIntents[slot])throw Error('Original control retained; recover it');
   if(intent?.outcome?.outcome!=='sealed')throw Error('Original sealed manifest required');
   const control={requestKey:crypto.randomUUID(),attempt:crypto.randomUUID()};
   if(command==='claim'&&!submittedJob())throw Error('Original submitted job required');
   payload=command==='submit'?{key:crypto.randomUUID(),reference:intent.reference,control}:{job:submittedJob(),control};
   bulkRecord={profile:'umf.demo.bulk-intent/1',slot,context:bulkContext(),input:payload};
   await reserveBulkIntent(bulkRecord);bulkIntents[slot]=bulkRecord;intentChannel.postMessage({changed:true});
  }
  if(command==='recover-submit'||command==='recover-claim'){
   bulkRecord=bulkIntents[command==='recover-submit'?'submit':'claim:0'];
   if(!bulkRecord)throw Error('Original bulk control required');payload=bulkRecord.input;
  }
  if(command==='review'){payload=submittedJob();if(!payload)throw Error('Original submitted job required');}

 }catch(error){storeStatus.textContent='Operation not sent';catalogOutput.textContent=error instanceof Error?error.message:String(error);busy=false;buttons();return;}
 buttons();storeStatus.textContent=command==='seal'?'Seal pending; original intent saved':'Working…';
 try{
  const result=await requestStore(command,payload);catalogOutput.textContent=JSON.stringify(result,null,2);
  if(bulkRecord){
   const retained={...bulkRecord,outcome:result};
   await settleBulkIntent(retained);bulkIntents[retained.slot]=retained;intentChannel.postMessage({changed:true});
   storeStatus.textContent=(retained.slot==='submit'?'Submission: ':'Claim: ')+result.status;
   if(result.status==='control-unknown'||result.status==='unresolved')detach();
  }else if(command==='review'){storeStatus.textContent=result.state?'Job: '+result.state.status:'Job review: '+result.status;}
  else if(result.outcome==='unavailable'){storeStatus.textContent='Store is in use in another tab';detach();}
  else if(result.outcome==='closed'){storeStatus.textContent='Store closed';detach();}
  else if(result.outcome==='available'){available=true;prepared=false;await refreshIntent();storeStatus.textContent='Local Truss store opened';}
  else if(result.outcome==='bootstrap-unavailable'){storeStatus.textContent='Sample loading requires recovery; original request retained';detach();}
  else if(result.outcome==='prepared'){document.querySelector('#stored-products')!.textContent=JSON.stringify(result.rows,null,2);prepared=true;preview=null;await refreshIntent();storeStatus.textContent='UPDATE prepared';}
  else if(result.outcome==='materialized'){if(result.input.sql!==sql.value){preview=null;storeStatus.textContent='Statement changed; preview again';}else{preview=result;storeStatus.textContent=`Frozen manifest: ${result.count} items, ${result.batches.length} batches`;}}
  else if(command==='seal'||command==='recover'){
   if(!intent)throw Error('Original intent unexpectedly unavailable');
   const retained:Intent={...intent,phase:result.outcome==='sealed'?'settled':'pending',outcome:result};
   intent=retained;storeStatus.textContent='Seal: '+result.outcome;
   try{await settleSealIntent(retained);intentChannel.postMessage({changed:true});}catch{storeStatus.textContent+='; local status not saved, original pending reference retained';}
   if(result.outcome==='unknown')detach();
  }else{storeStatus.textContent='Operation refused';}
 }catch(error){storeStatus.textContent=intent?'Response unavailable; original seal intent retained':'Local store unavailable';catalogOutput.textContent=error instanceof Error?error.message:String(error);detach();}
 finally{busy=false;buttons();}
}
openStore.addEventListener('click',()=>void localOperation('open'));
registerStore.addEventListener('click',()=>void localOperation('register'));
closeStore.addEventListener('click',()=>void localOperation('close'));
previewStore.addEventListener('click',()=>void localOperation('preview'));
sealStore.addEventListener('click',()=>void localOperation('seal'));
recoverStore.addEventListener('click',()=>void localOperation('recover'));
for(const [command,button] of Object.entries(bulkButtons))button.addEventListener('click',()=>void localOperation(command));
sql.addEventListener('input',()=>{preview=null;buttons();});
buttons();
void refreshIntent().catch(error=>{storeStatus.textContent='Seal journal unavailable; no new seal allowed';catalogOutput.textContent=String(error);}).finally(buttons);
