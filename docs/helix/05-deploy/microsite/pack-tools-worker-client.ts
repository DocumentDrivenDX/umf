// SPDX-License-Identifier: MIT OR Apache-2.0
import type {PackToolsRequest,PackToolsResult} from '../../../../src/domain-packs/pack-tools-types';
import type {PackToolsRuntime} from './pack-tools-model';
interface Pending {resolve:(value:PackToolsResult)=>void;reject:(reason:Error)=>void;timer:ReturnType<typeof setTimeout>}
export class PackToolsWorkerClient {
 private worker:Worker|undefined;private nextId=1;private pending=new Map<number,Pending>();
 constructor(private readonly wasmUrl:string,private readonly createWorker=()=>new Worker(new URL('./pack-tools-worker.js',import.meta.url),{type:'module'}),private readonly timeoutMs=30_000){}
 readonly generate:PackToolsRuntime=(request:PackToolsRequest)=>new Promise((resolve,reject)=>{
  const worker=this.getWorker(),id=this.nextId++,timer=setTimeout(()=>this.cancel('Rust generation exceeded the 30-second browser limit.'),this.timeoutMs);this.pending.set(id,{resolve,reject,timer});
  try{worker.postMessage({protocol:'umf.pack-tools-worker/1',id,wasmUrl:this.wasmUrl,request});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error instanceof Error?error:Error(String(error)));}
 });
 private getWorker(){
  if(this.worker)return this.worker;const worker=this.createWorker();this.worker=worker;
  worker.onmessage=(event:MessageEvent)=>{if(this.worker!==worker)return;const message=event.data;if(message?.protocol!=='umf.pack-tools-worker/1'||!Number.isSafeInteger(message.id))return;const pending=this.pending.get(message.id);if(!pending)return;if(message.ok){clearTimeout(pending.timer);this.pending.delete(message.id);pending.resolve(message.result);}else this.reset(Object.assign(Error(message.error?.message??'Pack tools failed.'),{code:message.error?.code??'PACK_TOOLS_RUNTIME',path:message.error?.path}));};
  worker.onerror=event=>{if(this.worker===worker)this.cancel(event.message||'Pack-tools worker failed.');};
  worker.onmessageerror=()=>{if(this.worker===worker)this.cancel('Pack-tools worker returned an unreadable message.');};
  return worker;
 }
 private reset(error:Error){this.worker?.terminate();this.worker=undefined;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();}
 cancel(message='Generation cancelled.'){this.reset(Object.assign(Error(message),{code:message.includes('30-second')?'PACK_TOOLS_TIMEOUT':'PACK_TOOLS_CANCELLED'}));}
 dispose(){this.cancel('Pack-tools worker closed.');}
}
