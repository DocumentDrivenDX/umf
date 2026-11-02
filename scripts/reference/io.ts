// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve,relative,isAbsolute} from 'node:path';
import {realpath,readFile} from 'node:fs/promises';
import {canonical,type Source} from '../../docs/helix/05-deploy/reference/model';
export const root=resolve(import.meta.dir,'../..');
export const config='docs/helix/05-deploy/reference';
export const sha=(v:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(v).digest('hex');
export const inputs=new Map<string,Source>();
export const originals=new Map<string,Uint8Array>();
export function json(value:unknown):string{return JSON.stringify(JSON.parse(canonical(value)),null,2)+'\n';}
export async function source(path:string,copy=true):Promise<Source>{
 const cached=inputs.get(path);if(cached&&(!copy||originals.has(cached.sha256)))return cached;
 if(isAbsolute(path)||path.includes('\\')||path.split('/').includes('..'))throw Error('REFERENCE_INPUT '+path);
 const actual=await realpath(resolve(root,path)),rel=relative(root,actual);if(rel.startsWith('..')||isAbsolute(rel))throw Error('REFERENCE_INPUT escaping symlink '+path);
 const bytes=new Uint8Array(await readFile(actual));const value={path,sha256:sha(bytes),bytes:bytes.length};inputs.set(path,value);if(copy)originals.set(value.sha256,bytes);return value;
}
/** Read UTF-8 source through the same realpath, digest and custody checks as source(). */
export async function sourceText(path:string):Promise<string>{
 const value=await source(path,true),bytes=originals.get(value.sha256)!;
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{throw Error('REFERENCE_INPUT invalid UTF-8 '+path);}
}
export async function read(path:string,copy=true):Promise<any>{await source(path,copy);return JSON.parse(await Bun.file(resolve(root,path)).text());}
export async function paths(pattern:string):Promise<string[]>{return (await Array.fromAsync(new Bun.Glob(pattern).scan({cwd:root,onlyFiles:true}))).sort();}
export const text=(path:string)=>Bun.file(resolve(root,path)).text();
