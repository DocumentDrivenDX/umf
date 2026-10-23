// SPDX-License-Identifier: MIT OR Apache-2.0
/** Dependency-free checkout closure guard; native semantic qualification stays separate. */
import {resolve,relative,isAbsolute} from 'node:path';
import {realpath,readdir} from 'node:fs/promises';
import {domains} from './domain-packs/catalog';

export const requiredPackIds=[...domains.map(d=>d.id),
 'legal','legal-appellate','medical','medical-carrier','medical-epidemiology',
 'medical-imaging','medical-terminology','court-documents-loader-demo',
 'sec-filings-loader-demo','public-company-intelligence','gtfs-schedule',
 'movielens','noaa-ghcn-daily','nyc-tlc'];

export async function checkDomainPackCheckout(repo=resolve(import.meta.dir,'..'),required=requiredPackIds){
 const root=await realpath(resolve(repo,'spec/domain-packs'));
 const discovered:string[]=[];
 for(const entry of await readdir(root,{withFileTypes:true}))
  if(entry.isDirectory()&&await Bun.file(resolve(root,entry.name,'pack.json')).exists())discovered.push(entry.name);
 const ids=[...new Set([...required,...discovered])].sort();
 let localAssets=0;
 async function local(base:string,reference:string,expectedHash?:string){
  if(!reference||isAbsolute(reference)||reference.includes('\\'))throw Error('PACK_CHECKOUT unsafe reference '+reference);
  const file=await realpath(resolve(base,reference)),inside=relative(base,file);
  if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('PACK_CHECKOUT escaping reference '+reference);
  const bytes=await Bun.file(file).bytes();
  if(expectedHash&&new Bun.CryptoHasher('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('PACK_CHECKOUT checksum '+reference);
  localAssets++;return bytes;
 }
 for(const id of ids){
  if(!/^[a-z0-9][a-z0-9-]*$/.test(id))throw Error('PACK_CHECKOUT unsafe pack id '+id);
  const directory=resolve(root,id),raw=await local(root,id+'/pack.json'),pack=JSON.parse(new TextDecoder().decode(raw));
  if(pack.id!==id)throw Error('PACK_CHECKOUT manifest identity '+id);
  for(const schema of pack.schemas??[])await local(directory,schema.reference);
  for(const source of Object.values(pack.sources??{}) as any[]){
   if(source.kind==='synthetic'&&source.reference===undefined)continue; // Generator declarations have no local file.
   if(typeof source.reference!=='string')throw Error('PACK_CHECKOUT missing source reference '+id);
   if(source.reference.includes(':'))continue; // External metadata references never fetch.
   await local(directory,source.reference,source.checksum?.algorithm==='sha256'?source.checksum.value:undefined);
  }
  for(const artifact of pack.loader?.artifacts??[])await local(directory,artifact.reference,artifact.sha256);
  for(const component of pack.composition?.components??[]){
   if(!ids.includes(component.id))throw Error('PACK_CHECKOUT missing component '+component.id);
   const child=JSON.parse(new TextDecoder().decode(await local(root,component.id+'/pack.json',component.checksum?.value)));
   if(child.version!==component.version)throw Error('PACK_CHECKOUT component version '+component.id);
  }
 }
 return {domainPacks:ids.length,localAssets};
}
if(import.meta.main)console.log(JSON.stringify(await checkDomainPackCheckout()));
