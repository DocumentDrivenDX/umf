import type {LoadInput} from './truss-browser/store.js';
/** Reserve one immutable load before dispatch. Later callers may only recover it. */
export async function admitOriginalLoad(input:LoadInput):Promise<'first'|'recover'>{
 const text=JSON.stringify({profile:'umf.demo.load-intent/1',input});
 if(new TextEncoder().encode(text).length>1024*1024)throw Error('Bounded original load intent required');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('umf-products-demo-control',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('intents');
  request.onerror=()=>reject(request.error??Error('Load journal unavailable'));
  request.onblocked=()=>reject(Error('Load journal blocked'));
  request.onsuccess=()=>resolve(request.result);
 });
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('intents','readwrite',{durability:'strict'});
  let admission:'first'|'recover'='recover',failure:unknown;
  const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{reject(error);}};
  tx.oncomplete=()=>resolve(admission);
  tx.onabort=()=>reject(failure??tx.error??Error('Load journal transaction aborted'));
  tx.onerror=()=>{failure??=tx.error??Error('Load journal transaction failed');};
  if(tx.durability!=='strict'){fail(Error('Strict load journal durability required'));return;}
  const object=tx.objectStore('intents'),request=object.get('load');
  request.onsuccess=()=>{try{
   if(request.result===undefined){object.add(text,'load');admission='first';}
   else if(request.result!==text)throw Error('Original load intent differs; reconciliation required');
  }catch(error){fail(error);}};
 });}finally{db.close();}
}
