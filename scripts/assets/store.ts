// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit host tooling only. Never imported by the browser library or pack admission. */
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,realpath,link,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {isIP} from 'node:net';

export type Asset={id:string;path:string;bytes:number;sha256:string;mediaType:string;
 sourceId:string;rights:'allowed'|'restricted'|'unknown';url?:string;mode?:'100644'|'100755';
 provenance?:unknown;license?:unknown;transport?:'github-release';downloadMediaType?:string};
export type Selection={assets:string[];entrypoint?:string;caseIds?:string[]};
export type AssetLock={version:1;kind:'domain-packs'|'conformance';id:string;revision:string;
 allowedHosts:string[];assets:Asset[];selections:Record<string,Selection>};
export type Options={cache:string;sourceRoot?:string;download?:boolean;rights?:'local-use'|'redistribute';
 timeoutMs?:number;fetcher?:typeof fetch};
const digest=/^[a-f0-9]{64}$/;
function fail(message:string):never{throw Error('ASSET '+message);}
export function assetPath(path:unknown):asserts path is string {
 if(typeof path!=='string'||!path||path.length>4096||path.includes('\\')||path.includes(':')||
  path.split('/').some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f\x7f]/.test(p)))fail('unsafe path');
}
function name(value:unknown):asserts value is string {
 if(typeof value!=='string'||!value||value.length>4096||/[\x00-\x1f\x7f]/.test(value))fail('invalid identity');
}
export function assetUrl(value:string,hosts:string[]):URL {
 const u=new URL(value),host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||
  !hosts.includes(host)||isIP(host)||host.includes(':')||!host.includes('.')||
  /(^|\.)(localhost|local|internal|test|invalid)$/.test(host))fail('URL/host policy');
 return u;
}
function releaseUrl(asset:Asset,hosts:string[]){
 if(!asset.url)fail('GitHub release URL required');
 const u=assetUrl(asset.url,hosts);
 if(u.hostname!=='github.com'||u.search||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/[A-Za-z0-9._-]+\/[a-f0-9]{64}\.[a-z0-9]+$/.test(u.pathname)||
  !u.pathname.split('/').at(-1)!.startsWith(asset.sha256+'.')||!hosts.includes('release-assets.githubusercontent.com'))fail('GitHub release URL policy');
}
export function parseLock(input:unknown):AssetLock {
 const d=input as AssetLock;
 if(!d||d.version!==1||!['domain-packs','conformance'].includes(d.kind)||
  !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(d.revision))fail('unsupported lock/revision');
 name(d.id);
 if(!Array.isArray(d.allowedHosts)||d.allowedHosts.some(h=>typeof h!=='string'||h!==h.toLowerCase())||
  !Array.isArray(d.assets)||!d.assets.length||!d.selections||typeof d.selections!=='object'||Array.isArray(d.selections))fail('lock structure');
 const ids=new Set<string>(),paths=new Set<string>(),hashSizes=new Map<string,number>();
 for(const a of d.assets){
  if(!a||typeof a!=='object')fail('asset structure');
  name(a.id);name(a.sourceId);assetPath(a.path);
  if(ids.has(a.id)||paths.has(a.path)||!digest.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<0||
   !['allowed','restricted','unknown'].includes(a.rights)||typeof a.mediaType!=='string'||
   !/^[\w.+-]+\/[\w.+-]+$/.test(a.mediaType)||a.mode!==undefined&&!['100644','100755'].includes(a.mode))fail('asset structure/duplicate');
  if(hashSizes.has(a.sha256)&&hashSizes.get(a.sha256)!==a.bytes)fail('conflicting hash size');
  ids.add(a.id);paths.add(a.path);hashSizes.set(a.sha256,a.bytes);
  if(a.transport!==undefined&&a.transport!=='github-release')fail('unsupported transport');
  if(a.downloadMediaType!==undefined&&!/^[\w.+-]+\/[\w.+-]+$/.test(a.downloadMediaType))fail('download media type');
  if(a.transport==='github-release')releaseUrl(a,d.allowedHosts);
  if(a.url!==undefined){if(typeof a.url!=='string')fail('URL structure');assetUrl(a.url,d.allowedHosts);}
 }
 // A file cannot also be an ancestor directory, including across selections.
 for(const path of paths){const parts=path.split('/');parts.pop();while(parts.length){if(paths.has(parts.join('/')))fail('path collision');parts.pop();}}
 for(const [id,s] of Object.entries(d.selections)){
  name(id);
  if(!s||!Array.isArray(s.assets)||!s.assets.length||new Set(s.assets).size!==s.assets.length||s.assets.some(a=>!ids.has(a)))fail('selection assets');
  if(s.entrypoint!==undefined){assetPath(s.entrypoint);if(!d.assets.some(a=>a.path===s.entrypoint&&s.assets.includes(a.id)))fail('entrypoint outside selection');}
  if(d.kind==='conformance'&&(!Array.isArray(s.caseIds)||!s.caseIds.length||new Set(s.caseIds).size!==s.caseIds.length))fail('conformance case inventory');
  for(const id of s.caseIds??[])name(id);
 }
 if(!Object.keys(d.selections).length)fail('missing selectors');
 return d;
}
export async function loadLock(path:string,sha256:string):Promise<AssetLock> {
 if(!digest.test(sha256))fail('lock SHA-256 required');
 const data=await Bun.file(path).bytes();
 if(createHash('sha256').update(data).digest('hex')!==sha256)fail('lock checksum');
 return parseLock(JSON.parse(new TextDecoder().decode(data)));
}
export function select(lock:AssetLock,selectors:string[],revision:string):Asset[]{
 if(revision!==lock.revision)fail('suite/source revision mismatch');
 if(!selectors.length||new Set(selectors).size!==selectors.length)fail('explicit unique selectors required');
 const ids=new Set<string>();
 for(const id of selectors){if(!Object.hasOwn(lock.selections,id))fail('missing selector '+id);for(const a of lock.selections[id]!.assets)ids.add(a);}
 return lock.assets.filter(a=>ids.has(a.id));
}
async function rootPath(root:string,create:boolean):Promise<string>{
 if(create)await mkdir(root,{recursive:true,mode:0o700});
 const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())fail('unsafe root');
 return realpath(root);
}
/** Reject symlinks in every asset-controlled component. Root is explicit and canonicalized. */
export async function localPath(root:string,path:string,createParents=false):Promise<string>{
 assetPath(path);const base=await rootPath(root,createParents),parts=path.split('/');let current=base;
 for(let i=0;i<parts.length;i++){
  current=join(current,parts[i]!);
  if(createParents&&i<parts.length-1)await mkdir(current,{mode:0o700}).catch((e:any)=>{if(e.code!=='EEXIST')throw e;});
  try{const stat=await lstat(current);if(stat.isSymbolicLink()||i<parts.length-1&&!stat.isDirectory()||i===parts.length-1&&!stat.isFile())fail('unsafe file component');}
  catch(e:any){if(e.code!=='ENOENT')throw e;if(i<parts.length-1)throw e;}
 }
 return current;
}
export async function verifyFile(path:string,asset:Asset):Promise<void>{
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const st=await file.stat();if(!st.isFile()||st.size!==asset.bytes)fail('size mismatch '+asset.id);
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of file.createReadStream({autoClose:false})){bytes+=chunk.length;hash.update(chunk);if(bytes>asset.bytes)fail('size mismatch '+asset.id);}
  if(bytes!==asset.bytes||hash.digest('hex')!==asset.sha256)fail('checksum mismatch '+asset.id);
 }finally{await file.close();}
}
async function* readChunks(path:string):AsyncGenerator<Uint8Array>{
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{if(!(await file.stat()).isFile())fail('non-file input');
  for await(const chunk of file.createReadStream({autoClose:false}))yield chunk;
 }finally{await file.close();}
}
function absent(e:any){return e.code==='ENOENT';}
async function existsVerified(path:string,asset:Asset):Promise<boolean>{
 try{await verifyFile(path,asset);return true;}catch(e){if(absent(e))return false;throw e;}
}
/** New bytes become visible only after verification; never overwrites an existing object. */
async function storeStream(target:string,asset:Asset,chunks:AsyncIterable<Uint8Array>,mode=0o444){
 const temp=join(dirname(target),'.partial-'+randomUUID());const file=await open(temp,'wx',0o600);
 try{
  const hash=createHash('sha256');let count=0;
  for await(const chunk of chunks){count+=chunk.length;if(count>asset.bytes)fail('size mismatch '+asset.id);hash.update(chunk);
   let offset=0;while(offset<chunk.length){const n=await file.write(chunk,offset,chunk.length-offset);if(!n.bytesWritten)fail('short write');offset+=n.bytesWritten;}}
  if(count!==asset.bytes||hash.digest('hex')!==asset.sha256)fail('checksum/size mismatch '+asset.id);
  await file.chmod(mode);await file.sync();await file.close();
  try{await link(temp,target);}catch(e:any){if(e.code!=='EEXIST')throw e;await verifyFile(target,asset);}
 }finally{await file.close().catch(()=>{});await unlink(temp).catch(()=>{});}
}
async function cachePath(cache:string,a:Asset){return localPath(cache,'sha256/'+a.sha256.slice(0,2)+'/'+a.sha256,true);}
export async function seedAsset(asset:Asset,sourceRoot:string,cache:string):Promise<string>{
 const source=await localPath(sourceRoot,asset.path);await verifyFile(source,asset);
 const target=await cachePath(cache,asset);if(await existsVerified(target,asset))return target;
 await storeStream(target,asset,readChunks(source));return target;
}
export async function resolveAsset(lock:AssetLock,asset:Asset,options:Options):Promise<string>{
 // Retained source data may be used, but never silently preferred over a corrupt source.
 if(options.sourceRoot){
  try{const source=await localPath(options.sourceRoot,asset.path);if(await existsVerified(source,asset))return source;}
  catch(e){if(!absent(e))throw e;}
 }
 const target=await cachePath(options.cache,asset);if(await existsVerified(target,asset))return target;
 if(!options.download)fail('offline asset missing '+asset.id);
 if(!options.rights||options.rights==='redistribute'&&asset.rights!=='allowed')fail('explicit rights/redistribution required');
 if(!asset.url)fail('no exact-byte download published '+asset.id);
 const url=assetUrl(asset.url,lock.allowedHosts);
 const timeout=options.timeoutMs??30_000;if(!Number.isFinite(timeout)||timeout<=0||timeout>300_000)fail('invalid timeout');
 const request={redirect:'manual' as const,signal:AbortSignal.timeout(timeout),headers:{'Accept':asset.downloadMediaType??asset.mediaType}};
 let response=await (options.fetcher??fetch)(url,request);
 // The sole redirect exception is an explicitly pinned GitHub release object to its CDN.
 if(asset.transport==='github-release'){
  releaseUrl(asset,lock.allowedHosts);
  if(response.status===302){
   const location=response.headers.get('location');await response.body?.cancel().catch(()=>{});
   if(!location)fail('missing release redirect');
   let next:URL;try{next=assetUrl(location,lock.allowedHosts);}catch{fail('invalid release redirect');}
   if(next.hostname!=='release-assets.githubusercontent.com'||!next.pathname.startsWith('/github-production-release-asset/'))fail('untrusted release redirect');
   response=await (options.fetcher??fetch)(next,request);
  }
 }
 try{
  if(response.status!==200||response.redirected)fail('HTTP status/redirect '+response.status);
  if(response.headers.has('content-length')&&response.headers.get('content-length')!==String(asset.bytes))fail('HTTP size mismatch');
  if(response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!==(asset.downloadMediaType??asset.mediaType))fail('HTTP media type mismatch');
  if(!response.body)fail('empty HTTP body');
  await storeStream(target,asset,response.body as unknown as AsyncIterable<Uint8Array>);
 }finally{await response.body?.cancel().catch(()=>{});}
 return target;
}
/** Verify the entire selected cohort before returning any path to a compiler or runner. */
export async function resolveSelection(lock:AssetLock,selectors:string[],revision:string,options:Options){
 const assets=select(lock,selectors,revision),paths:Record<string,string>=Object.create(null);
 for(const a of assets)paths[a.path]=await resolveAsset(lock,a,options);
 return {suiteId:lock.id,revision:lock.revision,selectors,paths};
}
async function verifyOutputMode(path:string,asset:Asset){
 const mode=(await lstat(path)).mode&0o111;
 if(mode!==(asset.mode==='100755'?0o111:0))fail('output executable mode mismatch '+asset.id);
}
export async function materialize(lock:AssetLock,selectors:string[],revision:string,options:Options,output:string){
 const selected=select(lock,selectors,revision);
 const resolved=await resolveSelection(lock,selectors,revision,options);
 // Preflight every existing destination before writing any selected asset.
 const targets:Record<string,string>=Object.create(null);
 for(const a of selected){const path=await localPath(output,a.path,true);if(await existsVerified(path,a))await verifyOutputMode(path,a);targets[a.path]=path;}
 for(const a of selected){const path=targets[a.path]!;if(await existsVerified(path,a))continue;
  await storeStream(path,a,readChunks(resolved.paths[a.path]!),a.mode==='100755'?0o755:0o644);}
 // Final pass catches changed objects before returning a runnable cohort.
 for(const a of selected){await verifyFile(targets[a.path]!,a);await verifyOutputMode(targets[a.path]!,a);}
 return {...resolved,root:await realpath(output),paths:targets};
}
