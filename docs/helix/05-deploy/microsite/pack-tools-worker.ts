// SPDX-License-Identifier: MIT OR Apache-2.0
import {createNativeFamilyDispatcher} from '../../../../bindings/core/wasm/index.js';
import type {PackToolsRequest,PackToolsResult} from '../../../../src/domain-packs/pack-tools-types';

type RequestMessage={protocol:'umf.pack-tools-worker/1';id:number;wasmUrl:string;request:PackToolsRequest};
type ResponseMessage={protocol:'umf.pack-tools-worker/1';id:number;ok:true;result:PackToolsResult}|{protocol:'umf.pack-tools-worker/1';id:number;ok:false;error:{code:string;message:string;path?:string}};
let runtime:((request:PackToolsRequest)=>PackToolsResult)|undefined,loadedUrl:string|undefined;
async function load(url:string){
 if(runtime){if(url!==loadedUrl)throw Object.assign(Error('Worker runtime was already initialized with another WASM asset.'),{code:'PACK_TOOLS_WASM_URL'});return runtime;}
 const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==self.location.origin)throw Object.assign(Error('WASM runtime must be loaded from this site.'),{code:'PACK_TOOLS_WASM_ORIGIN'});
 const wasm=await import(/* @vite-ignore */ parsed.href) as {default?:()=>Promise<unknown>;[key:string]:unknown};
 if(typeof wasm.default!=='function')throw Object.assign(Error('WASM initializer is missing.'),{code:'PACK_TOOLS_WASM_MISSING'});
 await wasm.default();
 const dispatcher=createNativeFamilyDispatcher(wasm),family=(dispatcher as any)['pack-tools'];
 if(!family||typeof family.generatePackTools!=='function')throw Object.assign(Error('This WASM release does not include the pack-tools operation.'),{code:'PACK_TOOLS_WASM_PROFILE'});
 runtime=(request:PackToolsRequest)=>family.generatePackTools({request}) as PackToolsResult;loadedUrl=url;return runtime;
}
self.addEventListener('message',async(event:MessageEvent<RequestMessage>)=>{
 const message=event.data;if(!message||message.protocol!=='umf.pack-tools-worker/1'||!Number.isSafeInteger(message.id))return;
 const respond=(response:ResponseMessage)=>self.postMessage(response);
 try{const generate=await load(message.wasmUrl);respond({protocol:'umf.pack-tools-worker/1',id:message.id,ok:true,result:generate(message.request)});}
 catch(error){const value=error as {code?:unknown;message?:unknown;path?:unknown};respond({protocol:'umf.pack-tools-worker/1',id:message.id,ok:false,error:{code:typeof value?.code==='string'?value.code:'PACK_TOOLS_RUNTIME',message:String(value?.message??error),...(typeof value?.path==='string'?{path:value.path}:{})}});}
});
