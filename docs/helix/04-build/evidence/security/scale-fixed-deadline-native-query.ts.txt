/** Experimental pg 8.16.3 private listener composition; not full producer/transport qualification. */
import type {PoolClient} from 'pg';
import type {Socket} from 'node:net';
import {ResponseIngress,decodeResponseFrame} from './wire';
import type {OriginalQueryJournal,LocalQueryCustody} from './journal';
export async function originalQuery(client:PoolClient,text:string,values?:readonly (string|null)[],journal?:OriginalQueryJournal,custody?:LocalQueryCustody):Promise<readonly ReturnType<typeof decodeResponseFrame>[]> {
 const connection=(client as unknown as {connection:{stream:Socket}}).connection;
 const stream=connection?.stream;if(!stream)throw Error('Original transport unavailable');
 const handlers=stream.listeners('data');if(handlers.length!==1)throw Error('Unsupported original parser composition');
 if(journal&&!custody)throw Error('Local query custody required before journal admission');
 const retained=journal?.begin(text,values??[],custody!);
 let outcome:'response_complete'|'server_error'|'uncertain'='uncertain';
 const originalParser=handlers[0];
 const limits={maxFrameBytes:1048576,maxFields:2048,maxTotalBytes:4194304,maxFrames:10000};
 const ingress=new ResponseIngress(limits);const frames:ReturnType<typeof decodeResponseFrame>[]=[];
 let resolveReady:()=>void=()=>{};let rejectReady:(e:Error)=>void=()=>{};
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 // Attach rejection handling before driver admission so original failure cannot escape the await.
 const observedReady=ready.then(()=>({ok:true as const}),error=>({ok:false as const,error}));
 const timeout=setTimeout(()=>{const error=Error('Original response deadline');rejectReady(error);stream.destroy(error);},5000);
 const guarded=(chunk:Buffer)=>{
   try{ingress.feed(chunk,frame=>{
     const decoded=decodeResponseFrame(frame,limits);frames.push(decoded);
     retained?.frame(frame);
     originalParser.call(stream,Buffer.from(frame));
     if(decoded.kind==='Z')resolveReady();
   });}catch{const error=Error('Original response refused');rejectReady(error);stream.destroy(error);}
 };
 const ended=()=>rejectReady(Error('Original transport ended'));
 stream.removeListener('data',originalParser);stream.on('data',guarded);stream.once('close',ended);
 let failed=false;let failure:unknown;
 try{
   try{await client.query({text,values:values?[...values]:undefined,rowMode:'array'});}catch(error){failed=true;failure=error;}
   const observed=await observedReady;if(!observed.ok)throw observed.error;
   ingress.finish();
   const errors=frames.filter(frame=>frame.kind==='E');
   if(failed){
     const code=failure&&typeof failure==='object'?Object.getOwnPropertyDescriptor(failure,'code')?.value:undefined;
     if(errors.length!==1||errors[0].fields.find(field=>field.tag==='C')?.value!==code)throw Error('Original error correspondence unavailable');
     outcome='server_error';throw failure;
   }
   if(errors.length)throw Error('Original error lost by driver');
   outcome='response_complete';return Object.freeze(frames);
 }finally{
   clearTimeout(timeout);stream.off('data',guarded);stream.off('close',ended);
   if(!stream.destroyed)stream.on('data',originalParser);
   try{retained?.finish(outcome);}catch(error){stream.destroy();throw error;}
 }
}

/** Original frame correspondence, not independent transaction/issuer authority. */
export function requireOriginalCompletion(frames:readonly ReturnType<typeof decodeResponseFrame>[],status:'I'|'T',command?:string):void {
 const ready=frames.filter(frame=>frame.kind==='Z'),commands=frames.filter(frame=>frame.kind==='C');
 if(ready.length!==1||ready[0].fields[0].status!==status||commands.length!==1||command&&commands[0].fields[0].command!==command)
   throw Error('Original transaction completion mismatch');
}
