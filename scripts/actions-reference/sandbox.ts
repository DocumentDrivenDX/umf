import {ReferenceHandlerLaunchOwner} from './launch-owner';
import {createHash} from 'node:crypto';
import {copyJson} from '../../src/model/json';
import {UmfError} from '../../src/model/types';

/** Host-only isolated runtime; trusted deployment admission lives in handlers.ts. */
export const referenceHandlerImage='sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27';
export type ReferenceHandlerOperation='read'|'exists'|'linked'|'create'|'set'|'delete'|'link'|'unlink';
const confinement=['--pull=never','--network=none','--read-only','--user','65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=32','--memory=128m','--memory-swap=128m','--cpus=1','--ipc=none','--log-driver=none','--entrypoint','/usr/bin/env'] as const;
const runtime=['-i','HOME=/nonexistent','PATH=/usr/local/bin:/usr/bin:/bin','/usr/bin/timeout','--signal=KILL','10s','node','--max-old-space-size=64'] as const;
export type ReferenceHandlerObservation={stage:'started';container:string}|{stage:'pending-cleanup';container:string;owner:string;cleanupConfirmed:false}|{stage:'finished';container:string;exitCode:number;oomKilled:boolean;cleanupConfirmed:true};
const operations=new Set<ReferenceHandlerOperation>(['read','exists','linked','create','set','delete','link','unlink']);
const bootstrap=String.raw`
const readline=require('node:readline');
const lines=readline.createInterface({input:process.stdin});
let configuration, pending, sequence=0;
process.stdout.write(JSON.stringify({kind:'ready',id:0,token:process.argv[1]})+'\n');
function emit(message){process.stdout.write(JSON.stringify({...message,token:configuration.token})+'\n');}
lines.on('line',async line=>{
 if(configuration){const response=JSON.parse(line);if(!pending||response.token!==configuration.token||response.id!==sequence)throw Error('Invalid supervisor response');const resolve=pending;pending=undefined;resolve(response);return;}
 configuration=JSON.parse(line);
 const gateway=Object.fromEntries(['read','exists','linked','create','set','delete','link','unlink'].map(operation=>[operation,async(...args)=>{
  if(pending)throw Error('Concurrent gateway calls are forbidden');
  const response=await new Promise(resolve=>{pending=resolve;emit({kind:'call',id:++sequence,operation,args});});
  if(!response.ok)throw Error('Gateway refused');return response.value;
 }]));
 try{const execute=new (Object.getPrototypeOf(async function(){}).constructor)('inputs','gateway',configuration.source);const outputs=await execute(configuration.inputs,gateway);emit({kind:'result',id:sequence+1,outputs});lines.close();process.stdin.destroy();}
 catch(error){emit({kind:'failure',id:sequence+1});process.exitCode=1;lines.close();process.stdin.destroy();}
});`;
export function referenceHandlerBuild(source:string):string{
 return createHash('sha256').update(JSON.stringify([referenceHandlerImage,confinement,runtime,bootstrap,source])).digest('hex');
}
export interface ReferenceHandlerProgram {id:string;version:string;build:string;source:string}
/** Each attempt owns a private stdin/stdout channel and only its own disposable container. */
export async function runReferenceHandler(program:ReferenceHandlerProgram,inputs:unknown,dispatch:(operation:ReferenceHandlerOperation,args:unknown[])=>unknown,timeoutMs=5000,observe?:(observation:ReferenceHandlerObservation)=>void):Promise<unknown>{
 program=copyJson(program) as unknown as ReferenceHandlerProgram;
 if(Object.keys(program).sort().join(',')!=='build,id,source,version'||typeof program.id!=='string'||!program.id||program.id.length>256||typeof program.version!=='string'||!program.version||program.version.length>256||typeof program.source!=='string'||program.source.length>65536||program.build!==referenceHandlerBuild(program.source))throw new UmfError('ACTION_HANDLER_PROFILE','Exact reviewed handler build required');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new UmfError('LIMIT','Qualified handler time bound required');
 const copiedInputs=copyJson(inputs),token=crypto.randomUUID(),name='umf-actions-handler-'+crypto.randomUUID();
 const owner=await ReferenceHandlerLaunchOwner.acquire(name,{...process.env}),dockerEnvironment=owner.environment,deadline=performance.now()+timeoutMs;
 const creator=Bun.spawn(['docker','create','--name',name,...confinement,'-i',referenceHandlerImage,...runtime,'-e',bootstrap,token],{stdin:'ignore',stdout:'pipe',stderr:'pipe',env:dockerEnvironment});
 const start=(cid:string)=>Bun.spawn(['docker','start','-a','-i',cid],{stdin:'pipe',stdout:'pipe',stderr:'pipe',env:dockerEnvironment});
 let child:ReturnType<typeof start>|undefined,containerId:string|undefined;let stderr:Promise<void>=Promise.resolve();
 const abort=(code:string,message:string):never=>{throw new UmfError(code,message);};
 const protocolCopy=(value:unknown)=>{try{return copyJson(value);}catch(error){if(error instanceof UmfError&&error.code==='LIMIT')throw error;return abort('FRAME_ACCESS','Handler payload is outside qualified JSON profile');}};
 let timer:ReturnType<typeof setTimeout>|undefined;
 let active=true;
 const withinDeadline=()=>{if(!active||performance.now()>=deadline){active=false;abort('LIMIT','Handler absolute time bound exceeded');}};
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{active=false;creator.kill();child?.kill();reject(new UmfError('LIMIT','Handler time bound exceeded'));},timeoutMs);});
 const write=(value:unknown)=>{const line=JSON.stringify(value)+'\n';if(line.length>131072)abort('LIMIT','Supervisor message exceeds bound');child!.stdin!.write(line);child!.stdin!.flush();};
 // Drain stderr with a hard bound; do not retain or expose handler-controlled diagnostics.
 const execute=(async()=>{
  const [created,_diagnostics,creationExit]=await Promise.all([new Response(creator.stdout).text(),new Response(creator.stderr).text(),creator.exited]);if(creationExit!==0||!/^[0-9a-f]{64}\n?$/.test(created))abort('LIMIT','Handler creation acknowledgement unavailable');const cid=created.trim();withinDeadline();await owner.acknowledge(cid);containerId=cid;withinDeadline();
  child=start(cid);
  stderr=(async()=>{let size=0;for await(const chunk of child!.stderr as ReadableStream<Uint8Array>){size+=chunk.byteLength;if(size>65536)abort('LIMIT','Handler stderr exceeds bound');}})();
  const consume=(async()=>{
  try{observe?.(Object.freeze({stage:'started' as const,container:name}));}catch{/* Instrumentation must not change execution. */}withinDeadline();
  const decoder=new TextDecoder('utf-8',{fatal:true});const decode=(chunk?:Uint8Array,stream=false)=>{try{return decoder.decode(chunk,{stream});}catch{return abort('FRAME_ACCESS','Malformed UTF-8 handler protocol');}};let buffered='',total=0,sequence=0,result:unknown,finished=false,ready=false;
  for await(const chunk of child!.stdout as ReadableStream<Uint8Array>){withinDeadline();total+=chunk.byteLength;if(total>1048576)abort('LIMIT','Handler channel exceeds bound');buffered+=decode(chunk,true);if(buffered.length>131072)abort('LIMIT','Handler message exceeds bound');
   let newline:number;while((newline=buffered.indexOf('\n'))>=0){withinDeadline();const line=buffered.slice(0,newline);buffered=buffered.slice(newline+1);let message:any;try{message=JSON.parse(line);}catch{abort('FRAME_ACCESS','Malformed handler protocol');}
    if(!ready){if(!message||JSON.stringify(message)!==line||Object.keys(message).sort().join(',')!=='id,kind,token'||message.kind!=='ready'||message.id!==0||message.token!==token)abort('FRAME_ACCESS','Authenticated bootstrap readiness required');ready=true;withinDeadline();write({source:program.source,inputs:copiedInputs,token});continue;}
    if(!active||finished||!message||Array.isArray(message)||JSON.stringify(message)!==line||message.token!==token||message.id!==sequence+1)abort('FRAME_ACCESS','Unauthenticated or out-of-order handler protocol');
    if(message.kind==='call'){
     if(++sequence>256)abort('LIMIT','Handler operation bound exceeded');
     if(Object.keys(message).some(key=>!['kind','id','token','operation','args'].includes(key))||!operations.has(message.operation)||!Array.isArray(message.args))abort('FRAME_ACCESS','Undeclared handler gateway operation');
     const value=dispatch(message.operation,protocolCopy(message.args) as unknown[]);if(value&&typeof (value as {then?:unknown}).then==='function')abort('FRAME_ACCESS','Only synchronous bounded candidate gateway dispatch is qualified');withinDeadline();write({id:sequence,token,ok:true,...(value===undefined?{}:{value:copyJson(value)})});
    }else if(message.kind==='result'){
     if(Object.keys(message).some(key=>!['kind','id','token','outputs'].includes(key))||!Object.hasOwn(message,'outputs'))abort('FRAME_ACCESS','Exact handler result required');
     result=protocolCopy(message.outputs);finished=true;child!.stdin!.end();
    }else abort('FRAME_ACCESS','Handler failed or sent unknown protocol');
   }
  }
  buffered+=decode();if(buffered||!finished)abort('FRAME_ACCESS','Incomplete handler protocol');
  const exit=await child!.exited;withinDeadline();if(exit!==0)abort('FRAME_ACCESS','Handler exited unsuccessfully');return result;
  })();return (await Promise.all([consume,stderr]))[0];
 })();
 let result:unknown,failure:unknown,failed=false,observation:Extract<ReferenceHandlerObservation,{stage:'finished'}>|undefined;
 try{result=await Promise.race([execute,timeout]);}catch(error){failed=true;failure=error;}
 finally{
  active=false;if(timer)clearTimeout(timer);creator.kill();child?.kill();
  if(!containerId){try{observe?.(Object.freeze({stage:'pending-cleanup',container:name,owner:owner.record.owner,cleanupConfirmed:false}));}catch{}failed=true;failure=new UmfError('LIMIT','Creation ownership requires operator reconciliation');}
  else{
  // Inspect only this owned container, then force removal and independently
  // confirm absence. No auto-remove race can erase the native OOM observation.
  const clients=new Set<ReturnType<typeof Bun.spawn>>();let cleanupTimer:ReturnType<typeof setTimeout>|undefined;
  const cleanupDeadline=performance.now()+2000;let cancelled=false;
  const guard=()=>{if(cancelled||performance.now()>=cleanupDeadline)abort('LIMIT','Owned handler cleanup timed out');};
  const docker=async(args:string[],maximumMs=2000)=>{
   guard();const client=Bun.spawn(['docker',...args],{stdout:'pipe',stderr:'pipe',env:dockerEnvironment});clients.add(client);
   let commandTimer:ReturnType<typeof setTimeout>|undefined;
   try{const collected=Promise.all([new Response(client.stdout).text(),new Response(client.stderr).text(),client.exited]);
    const [stdout,stderr,exit]=await Promise.race([collected,new Promise<never>((_,reject)=>{commandTimer=setTimeout(()=>{client.kill();reject(new UmfError('LIMIT','Owned handler cleanup command timed out'));},Math.max(1,Math.min(maximumMs,cleanupDeadline-performance.now())));})]);
    guard();return {stdout:stdout.trim(),stderr,exit};
   }finally{if(commandTimer)clearTimeout(commandTimer);clients.delete(client);client.kill();}
  };
  const cleanup=(async()=>{
   let state:{ExitCode:number;OOMKilled:boolean;Running:boolean}|undefined,invalidState=false;
   try{const inspected=await docker(['inspect','--format','{{json .State}}',containerId!],500);
    if(inspected.exit===0){try{state=JSON.parse(inspected.stdout);if(!state||typeof state.ExitCode!=='number'||typeof state.OOMKilled!=='boolean'||typeof state.Running!=='boolean')invalidState=true;}catch{invalidState=true;}}else if(!failed)invalidState=true;
   }catch{invalidState=true;}
   guard();await docker(['rm','-f',containerId!]);
   guard();const remaining=await docker(['container','ls','--all','--quiet','--filter','id='+containerId!]);
   if(remaining.exit!==0||remaining.stdout)abort('LIMIT','Owned handler removal could not be confirmed');
   await Promise.allSettled([stderr,child?.exited,creator.exited]);guard();
   await owner.release();guard();
   if(invalidState)abort('LIMIT','Owned handler state could not be verified');
   observation={stage:'finished',container:name,exitCode:state?.Running?-1:state?.ExitCode??-1,oomKilled:state?.OOMKilled??false,cleanupConfirmed:true};
  })();
  try{await Promise.race([cleanup,new Promise<never>((_,reject)=>{cleanupTimer=setTimeout(()=>{cancelled=true;for(const client of clients)client.kill();reject(new UmfError('LIMIT','Owned handler cleanup timed out'));},Math.max(1,cleanupDeadline-performance.now()));})]);}finally{cancelled=true;if(cleanupTimer)clearTimeout(cleanupTimer);}

  }
 }
 if(observation){try{observe?.(Object.freeze({...observation}));}catch{/* Instrumentation must not change the completed attempt. */}}
 if(observation?.oomKilled)throw new UmfError('LIMIT','Native handler memory bound exceeded');
 if(failed)throw failure;
 return result;
}
