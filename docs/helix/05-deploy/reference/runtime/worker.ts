import initializeCore from '../../../../../bindings/core/wasm/pkg/umf_core_wasm.js';
import type {Request} from './protocol';
import {execute} from './index';
import {createWorkbenchSdk} from './wasm-sdk';

type ExecutionMessage={
 protocol:1;
 type:'execute';
 request:Request;
 coreWasm:ArrayBuffer;
 compilerWasm?:ArrayBuffer;
};

type CompilerResult={descriptorHex:string;compiler:string;error?:string};
type ProtobufCompilerHost={
 Go:new()=>{importObject:WebAssembly.Imports;run(instance:WebAssembly.Instance):Promise<void>};
 umfCompileProtobuf(request:string):string;
};

declare const self:{onmessage:((event:{data:ExecutionMessage})=>Promise<void>)|null;postMessage:(data:unknown)=>void};

async function initializeCompiler(wasm:ArrayBuffer){
 const host=globalThis as unknown as ProtobufCompilerHost;
 const go=new host.Go();
 const {instance}=await WebAssembly.instantiate(wasm,go.importObject);
 void go.run(instance);
 return {async compile(request:unknown){
  const result:CompilerResult=JSON.parse(host.umfCompileProtobuf(JSON.stringify(request)));
  if(result.error)throw Error(result.error);
  return {
   descriptorSet:Uint8Array.from(result.descriptorHex.match(/../g)??[],byte=>parseInt(byte,16)),
   compiler:result.compiler,
  };
 }};
}

self.onmessage=async({data})=>{
 if(data?.protocol!==1||data.type!=='execute')return;
 try{
  await initializeCore({module_or_path:data.coreWasm});
  const [sdk,compiler]=await Promise.all([
   createWorkbenchSdk(),
   data.compilerWasm?initializeCompiler(data.compilerWasm):undefined,
  ]);
  self.postMessage(await execute(sdk,data.request,compiler));
 }catch(error){
  self.postMessage({protocol:1,type:'runtime-error',message:String(error)});
 }
};
