import {UmfError} from '../../model/types';
import {LIMITS} from '../../model/json';
import {importSmithySources,exportSmithySources} from './sources';
import type {SmithySelectionBackend} from './selection';
const protocol='umf.smithy.worker.v1';
/** One dedicated module worker per native operation; timeout/abort terminates the runtime. */
export function createSmithyWorkerBackend(options:{workerUrl:string|URL;timeoutMs?:number}):SmithySelectionBackend{
 const timeoutMs=options.timeoutMs??30000;
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||!(typeof options.workerUrl==='string'&&options.workerUrl.length>0||options.workerUrl instanceof URL)||Object.keys(options).some(k=>!['workerUrl','timeoutMs'].includes(k)))throw new UmfError('SMITHY_WORKER_OPTIONS','Worker URL and a 1–120000 ms deadline are required');
 const workerUrl=String(options.workerUrl);
 const request=(payload:Record<string,unknown>,stage:'ASSEMBLY'|'SELECTION',signal?:AbortSignal):Promise<string>=>{
  if(signal?.aborted)return Promise.reject(new UmfError('SMITHY_'+stage+'_CANCELLED','Operation was cancelled before worker creation'));
  if(typeof Worker==='undefined')return Promise.reject(new UmfError('SMITHY_WORKER_UNAVAILABLE','Module workers are unavailable in this runtime'));
  return new Promise<string>((resolve,reject)=>{
   let worker:Worker;try{worker=new Worker(workerUrl,{type:'module'});}catch(error){reject(new UmfError('SMITHY_WORKER_START',String(error)));return;}
   let settled=false;
   const finish=(error?:Error,report?:string)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();if(error)reject(error);else resolve(report!);};
   const abort=()=>finish(new UmfError('SMITHY_'+stage+'_CANCELLED','Operation cancelled; worker terminated'));
   const timer=setTimeout(()=>finish(new UmfError('SMITHY_'+stage+'_TIMEOUT','Operation deadline exceeded; worker terminated')),timeoutMs);
   worker.onmessage=({data})=>{
    if(!data||data.protocol!==protocol||typeof data.ok!=='boolean'||Object.keys(data).some(k=>!['protocol','ok','report','error'].includes(k))){finish(new UmfError('SMITHY_WORKER_PROTOCOL','Invalid worker response'));return;}
    if(data.ok&&typeof data.report==='string'&&data.report.length<=LIMITS.maxTextLength&&data.error===undefined)finish(undefined,data.report);
    else if(!data.ok&&typeof data.error==='string'&&data.error.length<=LIMITS.maxTextLength&&data.report===undefined)finish(new UmfError('SMITHY_WORKER_RUNTIME',data.error));
    else finish(new UmfError('SMITHY_WORKER_PROTOCOL','Invalid worker result'));
   };
   worker.onerror=event=>{event.preventDefault();finish(new UmfError('SMITHY_WORKER_RUNTIME',event.message));};
   worker.onmessageerror=()=>finish(new UmfError('SMITHY_WORKER_PROTOCOL','Worker response could not be decoded'));
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}
   try{worker.postMessage({protocol,...payload});}catch(error){finish(new UmfError('SMITHY_WORKER_START',String(error)));}
  });
 };
 return {identity:'smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1',assemble(files,control){
  const supplied=exportSmithySources(importSmithySources({files},{id:'worker-request'})).files;
  return request({files:supplied},'ASSEMBLY',control?.signal);
 },select(modelJson,selector,control){
  if(typeof modelJson!=='string'||modelJson.length>LIMITS.maxTextLength||typeof selector!=='string'||!selector.trim()||selector.length>LIMITS.maxTextLength)throw new UmfError('SMITHY_SELECTION_OPTIONS','Expected bounded native model and selector text');
  return request({operation:'select',modelJson,selector},'SELECTION',control?.signal);
 }};
}
