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
const storeStatus=document.querySelector<HTMLElement>('#store-status')!;
const catalogOutput=document.querySelector<HTMLElement>('#catalog')!;
const intentKey='umf.products-demo.seal-intent/1';
type Intent={profile:'umf.demo.seal-intent/1';reference:import('./truss-browser/store.js').SealReference;input:unknown;phase:'pending'|'settled';outcome?:import('./truss-browser/store.js').SealOutcome};
let intent:Intent|null=null,intentError='',preview:any=null;
try{const text=localStorage.getItem(intentKey);if(text){if(text.length>8*1024*1024)throw Error('Stored seal intent exceeds bounds');const parsed=JSON.parse(text);if(parsed.profile!=='umf.demo.seal-intent/1'||!parsed.reference||!['pending','settled'].includes(parsed.phase))throw Error('Stored seal intent requires reconciliation');intent=parsed;storeStatus.textContent='Original seal intent retained; reopen and prepare to recover';}}
catch(error){intentError=error instanceof Error?error.message:String(error);storeStatus.textContent='Seal storage unavailable; no new seal allowed';catalogOutput.textContent=intentError;}
let worker:Worker|undefined,sequence=0,available=false,prepared=false,busy=false;
let waiting:{id:number;resolve:(value:any)=>void;reject:(error:Error)=>void}|undefined;
function buttons(){
 openStore.disabled=busy||available;registerStore.disabled=closeStore.disabled=busy||!available;
 previewStore.disabled=busy||!prepared||!!intent||!!intentError;
 sealStore.disabled=busy||!prepared||!preview||!!intent||!!intentError;
 recoverStore.disabled=busy||!prepared||!intent||!!intentError;
}
function requestStore(command:string,payload?:unknown):Promise<any>{
 if(waiting)throw Error('Store request already pending');
 if(!worker){
  worker=new Worker(new URL('./truss-catalog-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{if(waiting&&event.data.id===waiting.id){const current=waiting;waiting=undefined;event.data.error?current.reject(new Error(event.data.error)):current.resolve(event.data.result);}};
  worker.onerror=event=>{const current=waiting;waiting=undefined;current?.reject(new Error(event.message));worker?.terminate();worker=undefined;};
 }
 return new Promise((resolve,reject)=>{waiting={id:++sequence,resolve,reject};worker!.postMessage({id:sequence,command,payload});});
}
function detach(){worker?.terminate();worker=undefined;available=false;prepared=false;preview=null;}
async function localOperation(command:string){
 let payload:unknown;
 try{
  if(command==='preview'){if(intent||intentError)throw Error('Original seal intent must be reconciled');payload={sql:sql.value};}
  if(command==='seal'){
   if(!preview||intent||intentError)throw Error('Fresh materialization and available intent storage required');
   const reference={profile:'truss-browser-seal-reference/0.1' as const,storeId:preview.sealContext.storeId,incarnation:preview.sealContext.incarnation,modelSha256:preview.sealContext.modelSha256,requestKey:crypto.randomUUID(),attempt:crypto.randomUUID(),manifestSha256:preview.manifest.sha256,planSha256:preview.plan.sha256};
   const pending:Intent={profile:'umf.demo.seal-intent/1',reference,input:preview.input,phase:'pending'};
   // Synchronous durable browser write precedes dispatch. Failure sends no seal RPC.
   localStorage.setItem(intentKey,JSON.stringify(pending));intent=pending;
   payload={requestKey:reference.requestKey,attempt:reference.attempt};
  }
  if(command==='recover'){if(!intent)throw Error('Original seal intent required');payload={reference:intent.reference};}
 }catch(error){storeStatus.textContent='Operation not sent';catalogOutput.textContent=error instanceof Error?error.message:String(error);buttons();return;}
 busy=true;buttons();storeStatus.textContent=command==='seal'?'Seal pending; original intent saved':'Working…';
 try{
  const result=await requestStore(command,payload);catalogOutput.textContent=JSON.stringify(result,null,2);
  if(result.outcome==='unavailable'){storeStatus.textContent='Store is in use in another tab';detach();}
  else if(result.outcome==='closed'){storeStatus.textContent='Store closed';detach();}
  else if(result.outcome==='available'){available=true;prepared=false;storeStatus.textContent='Local Truss store opened';}
  else if(result.outcome==='prepared'){prepared=true;preview=null;storeStatus.textContent='UPDATE prepared';}
  else if(result.outcome==='materialized'){if(result.input.sql!==sql.value){preview=null;storeStatus.textContent='Statement changed; preview again';}else{preview=result;storeStatus.textContent=`Frozen manifest: ${result.count} items, ${result.batches.length} batches`;}}
  else if(command==='seal'||command==='recover'){
   if(!intent)throw Error('Original intent unexpectedly unavailable');
   const retained:Intent={...intent,phase:result.outcome==='sealed'?'settled':'pending',outcome:result};
   intent=retained;storeStatus.textContent='Seal: '+result.outcome;
   try{localStorage.setItem(intentKey,JSON.stringify(retained));}catch{storeStatus.textContent+='; local status not saved, original pending reference retained';}
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
sql.addEventListener('input',()=>{preview=null;buttons();});
buttons();
