import {test,expect} from 'bun:test';
import {createSmithyWorkerBackend,assembleSmithyDocument,importSmithySources} from '../../src';
const files={'model.smithy':'$version: "2"\nnamespace test\nstring X'};
test('US-014-AC12: worker lifecycle terminates successful, cancelled, timed out and malformed jobs',async()=>{
 const original=globalThis.Worker;const workers:FakeWorker[]=[];
 class FakeWorker {
  onmessage:any;onerror:any;onmessageerror:any;terminated=0;
  constructor(..._:any[]){workers.push(this);}
  postMessage(_:unknown){} terminate(){this.terminated++;}
 }
 globalThis.Worker=FakeWorker as any;
 try{
  const backend=createSmithyWorkerBackend({workerUrl:'/worker.js',timeoutMs:20});
  const pre=new AbortController();pre.abort();await expect(backend.assemble(files,{signal:pre.signal})).rejects.toMatchObject({code:'SMITHY_ASSEMBLY_CANCELLED'});expect(workers.length).toBe(0);
  const success=backend.assemble(files);workers.at(-1)!.onmessage({data:{protocol:'umf.smithy.worker.v1',ok:true,report:'ok'}});expect(await success).toBe('ok');
  const abort=new AbortController();const pending=backend.assemble(files,{signal:abort.signal});abort.abort();await expect(pending).rejects.toMatchObject({code:'SMITHY_ASSEMBLY_CANCELLED'});
  await expect(backend.assemble(files)).rejects.toMatchObject({code:'SMITHY_ASSEMBLY_TIMEOUT'});
  const malformed=backend.assemble(files);workers.at(-1)!.onmessage({data:{protocol:'wrong'}});await expect(malformed).rejects.toMatchObject({code:'SMITHY_WORKER_PROTOCOL'});
  const recovery=backend.assemble(files);workers.at(-1)!.onmessage({data:{protocol:'umf.smithy.worker.v1',ok:true,report:'recovered'}});expect(await recovery).toBe('recovered');
  expect(workers.every(w=>w.terminated===1&&w.onmessage===null)).toBe(true);
  const source=importSmithySources({files},{id:'source'});const result=await assembleSmithyDocument(source,backend,{id:'out'});expect(result.status).toBe('blocked');expect(result.issues[0]!.code).toBe('SMITHY_ASSEMBLY_TIMEOUT');expect(result.model).toBeUndefined();expect(result.source).toEqual(source);
 }finally{globalThis.Worker=original;}
});
test('US-014-AC12: worker options reject invalid deadlines and URLs',()=>{
 for(const timeoutMs of [0,-1,Infinity,120001,1.5])expect(()=>createSmithyWorkerBackend({workerUrl:'/worker.js',timeoutMs})).toThrow();
 expect(()=>createSmithyWorkerBackend({workerUrl:{} as any})).toThrow();
});
test('US-014-AC15: selection workers isolate payloads, cancel, time out and recover',async()=>{
 const original=globalThis.Worker;const workers:FakeWorker[]=[];
 class FakeWorker {onmessage:any;onerror:any;onmessageerror:any;payload:any;terminated=0;constructor(){workers.push(this);}postMessage(data:unknown){this.payload=data;}terminate(){this.terminated++;}}
 globalThis.Worker=FakeWorker as any;
 try{
  const backend=createSmithyWorkerBackend({workerUrl:'/worker.js',timeoutMs:20});
  const pre=new AbortController();pre.abort();await expect(backend.select('{}','*',{signal:pre.signal})).rejects.toMatchObject({code:'SMITHY_SELECTION_CANCELLED'});expect(workers.length).toBe(0);
  const abort=new AbortController();const pending=backend.select('{}','string',{signal:abort.signal});expect(workers[0]!.payload).toEqual({protocol:'umf.smithy.worker.v1',operation:'select',modelJson:'{}',selector:'string'});abort.abort();await expect(pending).rejects.toMatchObject({code:'SMITHY_SELECTION_CANCELLED'});
  await expect(backend.select('{}','*')).rejects.toMatchObject({code:'SMITHY_SELECTION_TIMEOUT'});
  const recovered=backend.select('{}','*');workers.at(-1)!.onmessage({data:{protocol:'umf.smithy.worker.v1',ok:true,report:'{"shapeIds":[]}'}});expect(await recovered).toBe('{"shapeIds":[]}');expect(workers.every(w=>w.terminated===1)).toBe(true);
 }finally{globalThis.Worker=original;}
});
