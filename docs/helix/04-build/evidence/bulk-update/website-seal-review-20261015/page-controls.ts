import vm from 'node:vm';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const dir='/private/tmp/umf-seal-website-review-20261015';mkdirSync(dir,{recursive:true});
const source='/Users/erik/.codex/worktrees/security-action-source-custody/umf/docs/helix/05-deploy/microsite/action-compiler.ts';
const raw=readFileSync(source,'utf8'),entry="await import(/* @vite-ignore */ './action-compiler/weft_wasm.js')";
if(raw.split(entry).length!==2)throw Error('Exactly one fixed compiler import expected');
const script=new Bun.Transpiler({loader:'ts'}).transformSync(raw.replace(entry,'(globalThis.__compiler)').replaceAll('import.meta.url',"'https://example.test/umf/action-compiler.js'"));
const key='umf.products-demo.seal-intent/1';
const artifact=(name:string)=>({mediaType:'application/json',utf8:JSON.stringify({name}),sha256:name.padEnd(64,'0')});
const plan=artifact('a'),manifest=artifact('b'),receipt=artifact('c');
const reports:any[]=[];
function check(name:string,ok:boolean,details?:any){reports.push({name,passed:ok,...(details?{details}:{})});}
function fixture(){
 const shared=new Map<string,string>(),events:any[]=[],pages:any[]=[];let holder:any=null,seals=0,reads=0,denyWrite=false,denyRead=false,outcome='sealed',stored:any;
 async function page(){
  const elements=new Map<string,any>();const dom=(s:string)=>{if(!elements.has(s))elements.set(s,{value:'',disabled:true,textContent:'',listeners:new Map(),addEventListener(event:string,fn:any){this.listeners.set(event,fn);}});return elements.get(s);};
  const context:any={document:{querySelector:dom},URL,crypto,console,localStorage:{getItem(k:string){reads++;if(denyRead)throw Error('Storage read denied');return shared.get(k)??null;},setItem(k:string,v:string){if(denyWrite)throw Error('Quota failure');shared.set(k,v);}},__compiler:{default:async()=>{},MutationCompiler:class{compile_json(){return JSON.stringify({status:'compiled',plan});}}},fetch:async()=>({ok:true,json:async()=>({configuration:{},request:{sql:"UPDATE products SET name='Foo' WHERE id='bar'"},samples:[]})}),addEventListener:(type:string,fn:any)=>events.push({context,type,fn})};
  context.window=context;
  context.Worker=class{
   onmessage:any;onerror:any;dead=false;
   terminate(){this.dead=true;if(holder===this)holder=null;}
   postMessage(message:any){const {id,command,payload}=message;queueMicrotask(()=>{if(this.dead)return;let result:any,error:string|undefined;
    if(command==='open'){if(holder&&holder!==this)result={outcome:'unavailable',reason:'store_in_use'};else{holder=this;result={outcome:'available',info:{storeId:'store',incarnation:'epoch'},catalog:{}};}}
    else if(holder!==this)error='Not current owner';
    else if(command==='register')result={outcome:'prepared'};
    else if(command==='preview')result={outcome:'materialized',plan,manifest,count:0,batches:[],input:{sql:payload.sql,parameters:{},batchSize:2,maxItems:10000},sealContext:{storeId:'store',incarnation:'epoch',modelSha256:'d'.repeat(64)}};
    else if(command==='seal'){seals++;const pending=JSON.parse(shared.get(key)!);stored={outcome:'sealed',reference:pending.reference,manifest,receipt};result=outcome==='sealed'?stored:{outcome,code:outcome==='unknown'?'storage_outcome_unknown':'not_found',reference:pending.reference};}
    else if(command==='recover')result=outcome==='unresolved'?{outcome:'unresolved',code:'not_found',reference:payload.reference}:stored;
    else if(command==='close'){holder=null;result={outcome:'closed'};}
    this.onmessage?.({data:{id,...(error?{error}:{result})}});
   });}
  };
  vm.createContext(context);await vm.runInContext('(async()=>{'+script+'\nglobalThis.__page={localOperation,buttons};})()',context);
  const result={context,dom,operation:(command:string)=>context.__page.localOperation(command)};pages.push(result);return result;
 }
 return {page,shared,events,get seals(){return seals;},get reads(){return reads;},set denyWrite(v:boolean){denyWrite=v;},set denyRead(v:boolean){denyRead=v;},set outcome(v:string){outcome=v;}};
}
async function prepare(p:any){await p.operation('open');await p.operation('register');}
{
 const f=fixture(),p=await f.page();await prepare(p);await p.operation('preview');f.denyWrite=true;await p.operation('seal');check('Failed intent write dispatches no seal',f.seals===0&&!f.shared.has(key));
 f.denyWrite=false;f.outcome='unknown';await p.operation('seal');const original=f.shared.get(key);check('Unknown retains pending exact reference and detaches store',f.seals===1&&JSON.parse(original!).phase==='pending'&&p.dom('#store-open').disabled===false);
 await prepare(p);f.outcome='unresolved';await p.operation('recover');check('Unresolved absence blocks fresh preview and seal',p.dom('#store-preview').disabled&&p.dom('#store-seal').disabled&&JSON.parse(f.shared.get(key)!).reference.requestKey===JSON.parse(original!).reference.requestKey);
}
{
 const f=fixture(),b=await f.page(),a=await f.page();await prepare(a);await a.operation('preview');f.outcome='unknown';await a.operation('seal');const original=f.shared.get(key)!;await prepare(b);await b.operation('preview');await b.operation('seal');
 check('Already-open second tab preserves first tab pending intent after store takeover',f.seals===1&&f.shared.get(key)===original,{seals:f.seals,originalRequestKey:JSON.parse(original).reference.requestKey,retainedRequestKey:JSON.parse(f.shared.get(key)!).reference.requestKey});
}
const result={scope:'Independent original page control-flow test using Bun VM and explicit synthetic Worker/compiler/DOM/storage adapters; no browser/PGlite claim',sourceSha256:new Bun.CryptoHasher('sha256').update(raw).digest('hex'),passed:reports.filter(r=>r.passed).length,failed:reports.filter(r=>!r.passed).length,cases:reports};writeFileSync(dir+'/page-controls.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
