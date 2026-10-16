import type {SealOutcome,SealReference} from './truss-browser/store.js';
export interface SealIntent {profile:'umf.demo.seal-intent/1';reference:SealReference;input:unknown;phase:'pending'|'settled';outcome?:SealOutcome}
const database='umf-products-demo-layout02-control',store='intents';
const referenceFields=['profile','storeId','incarnation','requestKey','attempt','manifestSha256','planSha256','modelSha256'] as const;
function parse(value:unknown):SealIntent|null{
 if(value===undefined)return null;
 if(typeof value!=='string'||value.length>8*1024*1024)throw Error('Invalid retained seal intent');
 const intent=JSON.parse(value),ref=intent?.reference;
 if(intent?.profile!=='umf.demo.seal-intent/1'||!['pending','settled'].includes(intent.phase)||!ref||ref.profile!=='truss-browser-seal-reference/0.1'
  ||Object.keys(ref).length!==referenceFields.length||referenceFields.some(key=>typeof ref[key]!=='string'||!ref[key]||ref[key].length>256))throw Error('Retained seal intent requires reconciliation');
 return intent;
}
function encode(value:SealIntent){const text=JSON.stringify(value);parse(text);return text;}
function same(a:SealReference,b:SealReference){return referenceFields.every(key=>a[key]===b[key]);}
async function open(){
 return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(database,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(store);
  request.onerror=()=>reject(request.error??Error('Intent journal unavailable'));
  request.onblocked=()=>reject(Error('Intent journal upgrade blocked'));
  request.onsuccess=()=>resolve(request.result);
 });
}
async function transact(mode:IDBTransactionMode,operation:(object:IDBObjectStore,result:(value:SealIntent|null)=>void,fail:(error:unknown)=>void)=>void):Promise<SealIntent|null>{
 const db=await open();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(store,mode,mode==='readwrite'?{durability:'strict'}:undefined);
  let result:SealIntent|null=null,failure:unknown;
  const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{reject(error);}};
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(failure??tx.error??Error('Intent journal transaction aborted'));
  tx.onerror=()=>{failure??=tx.error??Error('Intent journal transaction failed');};
  if(mode==='readwrite'&&tx.durability!=='strict'){fail(Error('Strict intent journal durability required'));return;}
  try{operation(tx.objectStore(store),value=>{result=value;},fail);}catch(error){fail(error);}
 });}finally{db.close();}
}
export function readSealIntent(){return transact('readonly',(object,result,fail)=>{
 const request=object.get('current');request.onsuccess=()=>{try{result(parse(request.result));}catch(error){fail(error);}};
});}
/** Atomic cross-tab reservation. Completion, not request success, permits dispatch. */
export async function reserveSealIntent(value:SealIntent){
 const text=encode(value);
 await transact('readwrite',(object,result,fail)=>{
  const request=object.get('current');request.onsuccess=()=>{try{
   if(parse(request.result))throw Error('Original seal intent already retained; recover it');
   object.add(text,'current');result(value);
  }catch(error){fail(error);}};
 });
}
/** A stale page cannot overwrite another original request with a later response. */
export async function settleSealIntent(value:SealIntent){
 const text=encode(value);
 await transact('readwrite',(object,result,fail)=>{
  const request=object.get('current');request.onsuccess=()=>{try{
   const previous=parse(request.result);
   if(!previous||!same(previous.reference,value.reference))throw Error('Original seal intent changed; reconciliation required');
   object.put(text,'current');result(value);
  }catch(error){fail(error);}};
 });
}
