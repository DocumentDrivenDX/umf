import {admitOriginalLoad} from './load-intent';
// Opaque Truss capabilities stay in this worker. Messages use a fixed model and owned mutation compiler; no arbitrary backend SQL.
import type {StoreOpen,LocalAction,SelectionReadGrant,Materialization} from './truss-browser/store.js';
const scope=globalThis as unknown as DedicatedWorkerGlobalScope;
let current:StoreOpen|undefined,pending=Promise.resolve();
let action:LocalAction|undefined,readGrant:SelectionReadGrant|undefined;
let frozen:Materialization|undefined,modelSha256:string|undefined;
scope.onmessage=event=>{
 const id=event.data?.id,command=event.data?.command,payload=event.data?.payload;
 pending=pending.then(async()=>{
  try{
   if(!Number.isSafeInteger(id)||!['open','register','preview','seal','recover','submit','recover-submit','claim','recover-claim','review','execute','recover-execute','rows','close'].includes(command))throw Error('Unknown store request');
   if(command==='open'){
    if(current)throw Error('Store already opened');
    const {openBrowserStore}=await import('./truss-browser/store.js');
    const response=await fetch(new URL('./truss-browser/layout.sql',import.meta.url));if(!response.ok)throw Error('Layout unavailable');
    current=await openBrowserStore({name:'umf-products-demo',layoutSql:await response.text()});
    scope.postMessage({id,result:current.outcome==='available'?{outcome:'available',info:current.store.info(current.owner),catalog:await current.store.catalog(current.owner)}:current});
   }else{
    if(current?.outcome!=='available')throw Error('Available store required');
    if(command==='register'){
     const response=await fetch(new URL('./truss-browser/model.json',import.meta.url));if(!response.ok)throw Error('Model unavailable');
     const input=await response.json(),request=input.request;
     const registration=await current.store.registerDocument(current.owner,{documentId:request.modelPin.documentId,documentRevision:request.modelPin.revision,sourceUtf8:request.model.utf8}) as {outcome:string};
     if(registration.outcome==='refused'){scope.postMessage({id,result:registration});return;}
     const issued=await current.store.registerAction(current.owner,request.action.identity);
     const granted=await current.store.grantSelectionRead(current.owner,issued.action);
     action=issued.action;readGrant=granted.grant;frozen=undefined;modelSha256=issued.model.sha256;
     // This exact source-retained input/control is reused across retries and reloads.
     // Loading replays its creation receipt; it never resets existing product values.
     const target={documentId:request.modelPin.documentId,module:'sales',record:'products'};
     const loadInput={target,rows:input.seed.products.map((row:{id:string;name:string})=>({fields:[{module:'sales',field:'product-id',value:row.id},{module:'sales',field:'product-name',value:row.name}]})),request:{requestKey:'umf-products-demo-initial-load-b8-v1',attempt:'original-load-v1'}};
     const admission=await admitOriginalLoad(loadInput);
     const loaded=admission==='first'?await current.store.loadObjects(current.owner,loadInput):await current.store.recoverLoad(current.owner,loadInput);
     if(loaded.outcome!=='loaded'){scope.postMessage({id,result:{outcome:'bootstrap-unavailable',load:loaded}});return;}
     const rows=await current.store.readObjects(current.owner,target);

     scope.postMessage({id,result:{outcome:'prepared',load:loaded,rows,registration:registration.outcome,catalog:await current.store.catalog(current.owner),modelSha256:issued.model.sha256,preparationSha256:issued.preparation.sha256,selectionRead:granted.declaration}});
    }else if(command==='close'){await current.store.close(current.owner);current=undefined;action=undefined;readGrant=undefined;frozen=undefined;modelSha256=undefined;scope.postMessage({id,result:{outcome:'closed'}});}
    else{
     if(!action||!readGrant||!modelSha256)throw Error('Fresh issued action and read grant required');
     if(command==='preview'){
      const input={sql:payload?.sql,parameters:{},batchSize:2,maxItems:10000};
      frozen=undefined;
      frozen=await current.store.materialize(current.owner,action,readGrant,input);
      const info=current.store.info(current.owner);
      scope.postMessage({id,result:{outcome:'materialized',plan:frozen.plan,manifest:frozen.manifest,count:frozen.count,batches:frozen.batches,input,sealContext:{storeId:info.storeId,incarnation:info.incarnation,modelSha256}}});
     }else if(command==='seal'){
      if(!frozen)throw Error('Original materialization required');
      scope.postMessage({id,result:await current.store.seal(current.owner,action,readGrant,frozen.work,{requestKey:payload?.requestKey,attempt:payload?.attempt})});
     }else if(command==='submit')scope.postMessage({id,result:await current.store.submit(current.owner,action,readGrant,payload)});
     else if(command==='recover-submit')scope.postMessage({id,result:await current.store.recoverSubmit(current.owner,action,readGrant,payload)});
     else if(command==='claim')scope.postMessage({id,result:await current.store.claim(current.owner,action,readGrant,payload)});
     else if(command==='recover-claim')scope.postMessage({id,result:await current.store.recoverClaim(current.owner,action,readGrant,payload)});
     else if(command==='execute')scope.postMessage({id,result:await current.store.executeBatch(current.owner,action,readGrant,payload)});
     else if(command==='recover-execute')scope.postMessage({id,result:await current.store.recoverBatch(current.owner,action,readGrant,payload)});
     else if(command==='rows')scope.postMessage({id,result:{rows:await current.store.readObjects(current.owner,{documentId:'product-local-action-demo',module:'sales',record:'products'})}});
     else if(command==='review')scope.postMessage({id,result:await current.store.reviewJob(current.owner,action,readGrant,payload)});
     else scope.postMessage({id,result:await current.store.recoverSeal(current.owner,action,readGrant,payload?.reference)});
    }
   }
  }catch(error){scope.postMessage({id,error:error instanceof Error?error.message:String(error)});}
 });
};
