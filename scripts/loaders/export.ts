import {resolve,dirname,relative,isAbsolute,join,sep} from 'node:path';
import {mkdir,readFile,realpath,rename,rm,readdir,lstat} from 'node:fs/promises';
import {readJsonValue} from '../../src/model/serialization';
import {requireDomainPackProfile} from '../../src/domain-packs/profile';
import {readDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {verifyCompanion} from './companion';
import {hash} from './state';
import {readBounded} from './bytes';
export async function snapshotPack(input:string,includeSources=false):Promise<{pack:any;entries:Map<string,Uint8Array>}> {
 const budget={used:0,limit:100*1024*1024};
 const root=await realpath(dirname(resolve(input))),raw=await readBounded(await realpath(input),4*1024*1024,budget),text=new TextDecoder().decode(raw),pack=readJsonValue(text,'json') as any;
 requireDomainPackProfile(pack);
 const entries=new Map<string,Uint8Array>();
 const safe=(name:string)=>{
  const local=relative(root,resolve(root,name)).split(sep).join('/');
  if(!name||name.includes('\\')||isAbsolute(name)||local==='..'||local.startsWith('../')||isAbsolute(local)||local===''||name!==local)throw Error('Artifact reference leaves pack directory or is not canonical');return local;
 };
 function add(name:string,bytes:Uint8Array){const local=safe(name);if(entries.has(local)||[...entries.keys()].some(k=>k.startsWith(local+'/')||local.startsWith(k+'/')))throw Error('Duplicate export artifact path');entries.set(local,bytes);}
 async function read(name:string){safe(name);const actual=await realpath(resolve(root,name)),inside=relative(root,actual).split(sep).join('/');if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('Artifact symlink leaves pack directory');return readBounded(actual,10*1024*1024,budget);}
 add('domain-pack.json',raw);
 for(const entry of pack.schemas??[]){
  const bytes=await read(entry.reference),source=new TextDecoder().decode(bytes);
  if(entry.format==='tablespec'&&exportTableSpec(importTableSpec(source,{id:entry.id,format:'json'}))!==source)throw Error('Native schema recovery differs');
  if(entry.format==='umf'&&!validateDocument(readDocument(source,'json')).valid)throw Error('Invalid ontology schema');
  add(entry.reference,bytes);
 }
 if(pack.loader)for(const [name,bytes] of await verifyCompanion(pack,root,undefined,budget))add(name,bytes);
 const profile=pack.execution_profile;
 const inclusion=profile?new Set<string>([...profile.include_sources,...(pack.source_bindings??[]).filter((b:any)=>b.role==='rows'&&profile.targets.tabular?.includes(b.schema_id)).map((b:any)=>b.source_id)]):null;
 if(includeSources)for(const [id,source] of Object.entries(pack.sources??{}) as [string,any][]){
  if(inclusion&&!inclusion.has(id))continue;
  const reference=source.reference;if(!reference||reference.includes(':'))continue;
  if(source.kind!=='external'||source.license?.redistribution!=='allowed')throw Error('Source redistribution is not cleared');
  if(source.checksum?.algorithm!=='sha256')throw Error('Source checksum is required');
  const bytes=await read(reference);if(hash(bytes)!==source.checksum.value)throw Error('Source checksum differs');add(reference,bytes);
 }
 if([...entries.values()].some(b=>b.length>10*1024*1024)||[...entries.values()].reduce((a,b)=>a+b.length,0)>100*1024*1024)throw Error('Pack export exceeds byte budget');
 return {pack,entries};
}
export async function exportPack(input:string,output:string,options:{check?:boolean;includeSources?:boolean;afterSnapshot?:()=>Promise<void>}={}) {
 const {pack,entries}=await snapshotPack(input,options.includeSources);await options.afterSnapshot?.();
 const destination=resolve(output);
 if(options.check){
  for(const [name,bytes] of entries){let actual:Uint8Array;try{const path=await realpath(join(destination,name)),root=await realpath(destination),inside=relative(root,path);if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error();actual=await readBounded(path,bytes.length);}catch{throw Error('Stale pack export: '+name);}if(hash(actual)!==hash(bytes))throw Error('Stale pack export: '+name);}
 }else{
  try{const stat=await lstat(destination);if(stat.isSymbolicLink()||!stat.isDirectory()||(await readdir(destination)).length)throw Error('Export destination must be absent or empty; use --check for an existing export');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  await mkdir(dirname(destination),{recursive:true});const parent=await realpath(dirname(destination)),staging=join(parent,'.umf-export-'+crypto.randomUUID());
  try{
   await mkdir(staging);
   for(const [name,bytes] of entries){await mkdir(dirname(join(staging,name)),{recursive:true});await Bun.write(join(staging,name),bytes);}
   await rename(staging,destination);
  }finally{await rm(staging,{recursive:true,force:true});}
 }
 return {pack:pack.id,schemas:pack.schemas?.length??0,artifacts:entries.size,checked:Boolean(options.check)};
}
