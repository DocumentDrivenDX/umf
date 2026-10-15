/** Host dispatch custody only. These inert records never grant Truss authority. */
export interface BulkIntent {profile:'umf.demo.bulk-intent/1';slot:string;context:string;input:unknown;outcome?:unknown}
function encode(value:BulkIntent){const text=JSON.stringify(value);if(text.length>1024*1024)throw Error('Bounded bulk intent required');parse(text);return text;}
function parse(text:unknown):BulkIntent{
 if(typeof text!=='string'||text.length>1024*1024)throw Error('Invalid bulk intent');
 const value=JSON.parse(text);
 if(value?.profile!=='umf.demo.bulk-intent/1'||!/^(?:submit|cancel|(?:claim|execute):(?:0|[1-9][0-9]{0,3}))$/.test(value.slot)||typeof value.context!=='string'||!value.context||!value.input||typeof value.input!=='object')throw Error('Original bulk intent required');
 return value;
}
async function transaction<T>(mode:IDBTransactionMode,run:(object:IDBObjectStore,set:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('umf-products-demo-control',1);request.onupgradeneeded=()=>request.result.createObjectStore('intents');request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Bulk journal blocked'));request.onsuccess=()=>resolve(request.result);});
 try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction('intents',mode,mode==='readwrite'?{durability:'strict'}:undefined);let value:T,failure:unknown;
  const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{reject(error);}};
  tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure??tx.error??Error('Bulk journal aborted'));tx.onerror=()=>{failure??=tx.error;};
  if(mode==='readwrite'&&tx.durability!=='strict'){fail(Error('Strict bulk journal durability required'));return;}
  try{run(tx.objectStore('intents'),result=>{value=result;},fail);}catch(error){fail(error);}
 });}finally{db.close();}
}
export function readBulkIntents():Promise<Record<string,BulkIntent>>{
 return transaction('readonly',(object,set,fail)=>{const result:Record<string,BulkIntent>={},request=object.openCursor();request.onsuccess=()=>{try{
  const cursor=request.result;if(!cursor){set(result);return;}
  if(typeof cursor.key==='string'&&cursor.key.startsWith('bulk:')){const value=parse(cursor.value);if(cursor.key!=='bulk:'+value.slot)throw Error('Bulk intent slot differs');result[value.slot]=value;}
  cursor.continue();
 }catch(error){fail(error);}};});
}
/** Only the caller whose strict reservation commits may dispatch the first RPC. */
export function reserveBulkIntent(value:BulkIntent):Promise<void>{
 const text=encode(value);return transaction('readwrite',(object,set,fail)=>{const request=object.get('bulk:'+value.slot);request.onsuccess=()=>{try{
  if(request.result!==undefined){parse(request.result);throw Error('Original bulk intent retained; recover it');}
  object.add(text,'bulk:'+value.slot);set(undefined);
 }catch(error){fail(error);}};});
}
export function settleBulkIntent(value:BulkIntent):Promise<void>{
 const text=encode(value);return transaction('readwrite',(object,set,fail)=>{const request=object.get('bulk:'+value.slot);request.onsuccess=()=>{try{
  const previous=parse(request.result);
  if(previous.context!==value.context||JSON.stringify(previous.input)!==JSON.stringify(value.input))throw Error('Original bulk intent changed');
  object.put(text,'bulk:'+value.slot);set(undefined);
 }catch(error){fail(error);}};});
}
