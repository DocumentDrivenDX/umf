import type {Entry,Inventory} from './inventory';
export interface TransportDeps {fetch?:(input:string,init?:RequestInit)=>Promise<Response>;sleep?:(ms:number)=>Promise<void>}
export interface Download {bytes:Uint8Array;attempts:number}
class DownloadError extends Error {constructor(readonly code:string,readonly transient=false,readonly retryAfter=0){super(code);}}
export function createTransport(inv:Inventory,userAgent:string,deps:TransportDeps={}) {
 let total=0,lastStart=0;
 const sleep=deps.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));
 return async(entry:Entry):Promise<Download>=>{
  for(let attempt=0;;attempt++){
   if(total>=inv.max_total_bytes)throw Object.assign(Error('BYTE_LIMIT'),{attempts:0});
   await sleep(Math.max(0,inv.request_interval_ms-(Date.now()-lastStart)));lastStart=Date.now();
   const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   try {
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new DownloadError('TIMEOUT',true));},inv.timeout_ms);});
    const request=(async()=>{
     let response:Response;
     try{response=await (deps.fetch??fetch)(entry.url,{redirect:'manual',signal:abort.signal,headers:{'User-Agent':userAgent,Accept:entry.media_type}});}catch{throw new DownloadError('TRANSPORT',true);}
     const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let count=0;
     try {
      if(reader)for(;;){const next=await reader.read();if(next.done)break;count+=next.value.byteLength;total+=next.value.byteLength;
       if(count>inv.max_bytes||total>inv.max_total_bytes)throw new DownloadError('BYTE_LIMIT');chunks.push(next.value);
      }
     }finally{await reader?.cancel().catch(()=>{});}
     if(response.status>=300&&response.status<400)throw new DownloadError('REDIRECT');
     if(!response.ok){const header=response.headers.get('retry-after')??'',seconds=Number(header);const delay=header?(Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now()):0;throw new DownloadError('HTTP_'+response.status,response.status===429||response.status>=500,Math.max(0,Math.min(60000,Number.isFinite(delay)?delay:0)));}
     if(response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!==entry.media_type)throw new DownloadError('MEDIA_TYPE');
     const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
     if(entry.media_type==='application/pdf'&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new DownloadError('PDF_MAGIC');
     return bytes;
    })();
    const bytes=await Promise.race([request,timeout]);return {bytes,attempts:attempt+1};
   }catch(error){
    const failure=error instanceof DownloadError?error:new DownloadError('TRANSPORT',true);
    if(!failure.transient||attempt>=inv.retries||total>=inv.max_total_bytes)throw Object.assign(Error(failure.code),{attempts:attempt+1});
    await sleep(Math.min(60000,Math.max(failure.retryAfter,1000*2**attempt)));
   }finally{if(timer)clearTimeout(timer);abort.abort();}
  }
 };
}
