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

// The compiler cohort above remains independent of local catalog registration.
const openStore=document.querySelector<HTMLButtonElement>('#store-open')!;
const registerStore=document.querySelector<HTMLButtonElement>('#store-register')!;
const closeStore=document.querySelector<HTMLButtonElement>('#store-close')!;
const storeStatus=document.querySelector<HTMLElement>('#store-status')!;
const catalogOutput=document.querySelector<HTMLElement>('#catalog')!;
let worker:Worker|undefined,sequence=0;
let waiting:{id:number;resolve:(value:any)=>void;reject:(error:Error)=>void}|undefined;
function requestStore(command:string):Promise<any>{
 if(waiting)throw Error('Store request already pending');
 if(!worker){
  worker=new Worker(new URL('./truss-catalog-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{if(waiting&&event.data.id===waiting.id){const current=waiting;waiting=undefined;event.data.error?current.reject(new Error(event.data.error)):current.resolve(event.data.result);}};
  worker.onerror=event=>{const current=waiting;waiting=undefined;current?.reject(new Error(event.message));worker?.terminate();worker=undefined;};
 }
 return new Promise((resolve,reject)=>{waiting={id:++sequence,resolve,reject};worker!.postMessage({id:sequence,command});});
}
async function localOperation(command:string){
 openStore.disabled=registerStore.disabled=closeStore.disabled=true;storeStatus.textContent='Working…';
 try{
  const result=await requestStore(command);
  catalogOutput.textContent=JSON.stringify(result,null,2);
  if(result.outcome==='unavailable'){storeStatus.textContent='Store is in use in another tab';worker?.terminate();worker=undefined;openStore.disabled=false;}
  else if(result.outcome==='closed'){storeStatus.textContent='Store closed';worker?.terminate();worker=undefined;openStore.disabled=false;}
  else{storeStatus.textContent=result.outcome==='available'?'Local Truss store opened':result.outcome==='refused'?'Catalog registration refused':'UPDATE prepared';registerStore.disabled=closeStore.disabled=false;}
 }catch(error){storeStatus.textContent='Local store unavailable';catalogOutput.textContent=error instanceof Error?error.message:String(error);worker?.terminate();worker=undefined;openStore.disabled=false;}
}
openStore.addEventListener('click',()=>void localOperation('open'));
registerStore.addEventListener('click',()=>void localOperation('register'));
closeStore.addEventListener('click',()=>void localOperation('close'));
