import {mkdir,open,rm,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {parseInventory,type Profile,type Rights} from './inventory';
import {createTransport,type TransportDeps} from './transport';
import {hash,json,loadCurrent,preparePublication,atomicJson,projection,type Snapshot,type Binding,type Row,type Observation} from './state';
export interface RunOptions {state:string;pack:{id:string;version:string;loader:{profile:string}};packHash:string;inventoryText?:string;mode:'backfill'|'refresh'|'replay';rights:Rights;userAgent?:string}
export interface ItemResult {id:string;status:'complete'|'failed';sha256?:string;attempts?:number;code?:string}
export interface Receipt {operation:'umf.document-loader';version:'1.0.0';run_id:string;pack_hash:string;inventory_hash:string;mode:string;rights:Rights;started_at:string;finished_at:string;scope:string[];status:'complete'|'failed';items:ItemResult[];code?:string;cleanup_warning?:boolean}
export interface EngineDeps extends TransportDeps {beforeCommit?:()=>Promise<void>;afterCommit?:()=>Promise<void>}
export async function runLoader(o:RunOptions,deps:EngineDeps={}):Promise<Receipt>{
 if(!['court-documents','sec-filings','documents'].includes(o.pack.loader.profile)||!['backfill','refresh','replay'].includes(o.mode)||!['local-use','redistribute'].includes(o.rights)||!/^[a-f0-9]{64}$/.test(o.packHash))throw Error('RUN_CONFIGURATION');
 const profile=o.pack.loader.profile as Profile;
 // Live config is fully preflighted before creating state or issuing requests.
 const live=o.mode==='replay'?undefined:parseInventory(o.inventoryText??'',profile,o.rights);
 if(o.mode!=='replay'&&profile==='sec-filings'&&(!o.userAgent||!/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(o.userAgent)))throw Error('SEC_USER_AGENT');
 if(o.userAgent&&/[\r\n]/.test(o.userAgent))throw Error('USER_AGENT');
 const root=resolve(o.state);await mkdir(root,{recursive:true});
 let lock;try{lock=await open(join(root,'lock'),'wx');}catch(e:any){if(e.code==='EEXIST')throw Error('STATE_LOCKED');throw e;}
 const runId=crypto.randomUUID(),started=new Date().toISOString();let committed=false;
 const receipt:Receipt={operation:'umf.document-loader',version:'1.0.0',run_id:runId,pack_hash:o.packHash,inventory_hash:'',mode:o.mode,rights:o.rights,started_at:started,finished_at:started,scope:[],status:'failed',items:[]};
 try {
  await lock.writeFile(json({pid:process.pid,run_id:runId,started_at:started}));
  const prior=await loadCurrent(root);
  const inventoryText=o.mode==='replay'?prior?.inventoryText:o.inventoryText;
  if(!inventoryText)throw Error('NO_REPLAY_SNAPSHOT');
  if(o.mode==='replay'&&o.inventoryText!==undefined&&hash(o.inventoryText)!==hash(inventoryText))throw Error('REPLAY_INVENTORY_MISMATCH');
  const inv=live??parseInventory(inventoryText,profile,o.rights);
  const binding:Binding={pack_hash:o.packHash,pack_id:o.pack.id,pack_version:o.pack.version,profile,rights:o.rights,inventory_id:inv.id,implementation_version:'1.0.0'};
  if(prior&&JSON.stringify(prior.snapshot.binding)!==JSON.stringify(binding))throw Error('STATE_IDENTITY');
  receipt.inventory_hash=hash(inventoryText);receipt.scope=inv.entries.map(e=>e.id);
  const history:Row[]=prior?[...prior.snapshot.history]:[],observations:Observation[]=prior?[...prior.snapshot.observations]:[],objects=prior?new Map(prior.objects):new Map<string,Uint8Array>();
  const inventoryHistory={...(prior?.snapshot.inventory_history??{}),[receipt.inventory_hash]:inventoryText};
  let rows:Row[]=[];
  if(o.mode==='replay'){
   rows=prior!.snapshot.rows;
   // Scope/order and retained context must agree with the committed inventory.
   if(rows.length!==inv.entries.length||rows.some((r,i)=>r.id!==inv.entries[i]!.id||r.url!==inv.entries[i]!.url||r.media_type!==inv.entries[i]!.media_type||JSON.stringify(r.metadata)!==JSON.stringify(inv.entries[i]!.metadata??{})||JSON.stringify(r.license)!==JSON.stringify(inv.entries[i]!.license)))throw Error('REPLAY_CONTEXT');
   receipt.items=rows.map(r=>({id:r.id,status:'complete',sha256:r.sha256,attempts:0}));
  }else{
   const download=createTransport(inv,o.userAgent??'UMF document-loader/1.0.0',deps);
   for(const entry of inv.entries){
    try {
     const {bytes,attempts}=await download(entry),digest=hash(bytes);
     if(entry.expected_sha256!==undefined&&entry.expected_sha256!==digest)throw Object.assign(Error('SOURCE_HASH'),{attempts});
     const row:Row={id:entry.id,url:entry.url,sha256:digest,media_type:entry.media_type,bytes:bytes.length,revision:digest,metadata:entry.metadata??{},license:entry.license};
     objects.set(digest,bytes);rows.push(row);
     if(!history.some(h=>JSON.stringify(h)===JSON.stringify(row)))history.push(row);
     observations.push({run_id:runId,id:entry.id,sha256:digest,url:entry.url,inventory_hash:receipt.inventory_hash,retrieved_at:new Date().toISOString(),metadata:entry.metadata??{},license:entry.license});
     receipt.items.push({id:entry.id,status:'complete',sha256:digest,attempts});
    }catch(error:any){receipt.items.push({id:entry.id,status:'failed',code:error.message,attempts:error.attempts??1});}
   }
   if(receipt.items.some(i=>i.status==='failed'))throw Error('INCOMPLETE_COVERAGE');
  }
  if(Object.keys(inventoryHistory).length>10000||history.length>10000||observations.length>100000||[...objects.values()].reduce((a,b)=>a+b.length,0)>500*1024*1024)throw Error('STATE_LIMIT');
  receipt.status='complete';receipt.finished_at=new Date().toISOString();
  const snapshot:Snapshot={version:'1.0.0',binding,inventory_hash:receipt.inventory_hash,receipt_hash:hash(json(receipt)),projection_hash:hash(projection(rows)),projection_version:'1.0.0',inventory_history:inventoryHistory,history,rows,observations};
  const pointer=await preparePublication(root,runId,snapshot,inventoryText,objects,receipt);
  await deps.beforeCommit?.();await atomicJson(root,'current.json',pointer);committed=true;
  // Post-commit diagnostics cannot turn a committed publication into a failed run.
  try{await deps.afterCommit?.();}catch{receipt.cleanup_warning=true;}
 }catch(error:any){receipt.status='failed';receipt.code=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'STATE_IO';receipt.finished_at=new Date().toISOString();}
 finally{
  try{await mkdir(join(root,'runs'),{recursive:true});await atomicJson(join(root,'runs'),runId+'.json',receipt);}catch{if(committed)receipt.cleanup_warning=true;else receipt.code='RECEIPT_IO';}
  try{await lock.close();await rm(join(root,'lock'));}catch{if(committed)receipt.cleanup_warning=true;else receipt.code='LOCK_IO';}
 }
 return receipt;
}
