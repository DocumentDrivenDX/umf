import {execute} from './index';
import type {Request} from './protocol';
declare const self:{onmessage:((event:{data:any})=>Promise<void>)|null;postMessage:(data:unknown)=>void};
let compiler:any;
self.onmessage=async({data})=>{
 if(data.protocol===1&&data.type==='compiler-assets'){
  try{const go=new (globalThis as any).Go();const {instance}=await WebAssembly.instantiate(data.wasm,go.importObject);void go.run(instance);compiler={compile:async(request:any)=>{const result=JSON.parse((globalThis as any).umfCompileProtobuf(JSON.stringify(request)));if(result.error)throw Error(result.error);return {descriptorSet:Uint8Array.from(result.descriptorHex.match(/../g)??[],(s:string)=>parseInt(s,16)),compiler:result.compiler};}};self.postMessage({protocol:1,type:'compiler-ready'});}catch(error){self.postMessage({protocol:1,type:'compiler-error',message:String(error)});}return;
 }
 self.postMessage(await execute(data as Request,compiler));
};
