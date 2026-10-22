/** Trusted local host preparation. Issuance is not native authorization.
 * The host owns executable/source pins and filesystem custody. */
import {lowerSecurityOriginalUseProgram} from '/Users/erik/Projects/truss/packages/postgresql/src/security-query-use.ts';
export interface OriginalPreparedHandle {readonly kind:'original-prepared-query'}
type Program=Awaited<ReturnType<typeof lowerSecurityOriginalUseProgram>>;
const digest=(value:Uint8Array|string)=>new Bun.CryptoHasher('sha256').update(value).digest('hex');
const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const refuse=():never=>{throw Error('ORIGINAL_PREPARATION_REFUSED');};
export class OriginalSecurityPreparation {
 #pins:Readonly<Record<string,string>>;
 #binary:string;
 #profileSha256:string;
 #prepared=new WeakMap<OriginalPreparedHandle,{program:Program;request:any;handoff:any}>();
 /** Configuration is supplied by the trusted host, never an admission request. */
 constructor(binary:string,pins:Record<string,string>,profileSha256:string){
  this.#binary=binary;this.#pins=Object.freeze({...pins});this.#profileSha256=profileSha256;
  if(!/^[a-f0-9]{64}$/.test(profileSha256)||!Object.hasOwn(this.#pins,binary)||!Object.values(this.#pins).every(v=>/^[a-f0-9]{64}$/.test(v)))refuse();
 }
 async #current(){
  for(const [path,expected] of Object.entries(this.#pins))if(digest(new Uint8Array(await Bun.file(path).arrayBuffer()))!==expected)refuse();
 }
 async prepare(requestJson:string):Promise<OriginalPreparedHandle>{
  if(typeof requestJson!=='string'||new TextEncoder().encode(requestJson).length>16000000)refuse();
  const request=JSON.parse(requestJson);
  await this.#current();
  const process=Bun.spawn([this.#binary],{stdin:new TextEncoder().encode(requestJson),stdout:'pipe',stderr:'pipe'});
  const timer=setTimeout(()=>process.kill(),10000);
  let stdout:string,stderr:string,exitCode:number;
  try{[stdout,stderr,exitCode]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);}finally{clearTimeout(timer);}
  if(exitCode!==0||stderr||stdout.length>32000000)refuse();
  const handoff=JSON.parse(stdout);
  const ontology=JSON.parse(request.ontologyJson),binding=JSON.parse(request.bindingJson);
  const input:Parameters<typeof lowerSecurityOriginalUseProgram>[0]={handoff,expectedHandoffSha256:digest(JSON.stringify(canonical(handoff))),bindingJson:request.bindingJson,ontologyJson:request.ontologyJson,queryProfileJson:request.queryProfileJson,expectedProfileSha256:this.#profileSha256,target:{documentId:'domain',moduleId:'m',elementId:'Resource'},subject:ontology.subject,types:binding.types,home:binding.home};
  const program=await lowerSecurityOriginalUseProgram(input);
  await this.#current();
  const handle=Object.freeze({kind:'original-prepared-query' as const});
  this.#prepared.set(handle,{program,request,handoff});
  return handle;
 }
 render(handle:OriginalPreparedHandle){
  const entry=this.#prepared.get(handle);if(!entry)return refuse();
  // Data copies cannot create another issued handle or replace the stored plan.
  return {program:entry.program,request:JSON.parse(JSON.stringify(entry.request)),handoff:JSON.parse(JSON.stringify(entry.handoff))};
 }
}
