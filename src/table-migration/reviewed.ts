// SPDX-License-Identifier: MIT OR Apache-2.0
import {readDocument} from '../model/document';
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import type {TableDeploymentBundle} from '../table-deployment';

export type ReviewedChangeKind='drop-column'|'rename-column'|'change-column-type'|'tighten-not-null'|'replace-check'|'replace-foreign-key'|'replace-index'|'replace-primary-key'|'change-policy';
export interface ReviewedChangeMarker {
 id:string;kind:ReviewedChangeKind;path:string;oldDigest:string;newDigest:string;conversion?:string;
}
export interface ReviewedChangeCandidate extends ReviewedChangeMarker {oldValue:unknown;newValue:unknown}
export const reviewedValueDigest=(value:unknown):string=>hashCanonical(value===undefined?null:value);
const safeId=(value:string):boolean=>!!value&&value.length<=128&&!value.includes('\0');

/** Source-bound marker candidates. Candidates only identify changes; compiler support is checked independently. */
export function discoverTableMigrationChanges(previous:TableDeploymentBundle,next:TableDeploymentBundle):ReviewedChangeCandidate[]{
 const before=readDocument(previous.source.utf8,previous.source.format),after=readDocument(next.source.utf8,next.source.format);
 const result:ReviewedChangeCandidate[]=[];
 const walk=(a:unknown,b:unknown,path:string):void=>{
  if(canonical(a)===canonical(b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   const ak=Object.keys(a as object),bk=Object.keys(b as object),keys=[...new Set([...ak,...bk])].sort();
   for(const key of keys)walk((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'));
   return;
  }
  if(Array.isArray(a)&&Array.isArray(b)){
   const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)walk(a[i],b[i],path+'/'+i);return;
  }
  const kind=guessKind(path,a,b);if(!kind)return;
  const oldDigest=reviewedValueDigest(a),newDigest=reviewedValueDigest(b),id='review-'+hashCanonical([kind,path,oldDigest,newDigest]).slice(0,24);
  result.push({id,kind,path,oldDigest,newDigest,...(a===undefined?{}:{oldValue:a}),...(b===undefined?{}:{newValue:b})});
 };
 walk(before,after,'');return result;
}
function guessKind(path:string,a:unknown,b:unknown):ReviewedChangeKind|undefined{
 if(/\/members\/\d+$/.test(path)&&b===undefined)return 'drop-column';
 if(/\/columns\/\d+\/name$/.test(path))return 'rename-column';
 if(/\/columns\/\d+\/nativeType$/.test(path))return 'change-column-type';
 if(/\/columns\/\d+\/nullable$/.test(path)&&a===true&&b===false)return 'tighten-not-null';
 if(/\/checks\/\d+$/.test(path))return a===undefined?'replace-check':'replace-check';
 if(/\/foreignKeys\/\d+$/.test(path))return 'replace-foreign-key';
 if(/\/indexes\/\d+$/.test(path))return 'replace-index';
 if(/\/keys\/\d+$/.test(path))return 'replace-primary-key';
 if(/\/policy\//.test(path))return 'change-policy';
 return undefined;
}
export function validateReviewedChangeMarkers(value:unknown,previous:TableDeploymentBundle,next:TableDeploymentBundle):ReviewedChangeMarker[]{
 if(!Array.isArray(value)||value.length>512)throw new Error('reviewedChanges must be an array of at most512 exact markers');
 const candidates=discoverTableMigrationChanges(previous,next),byId=new Map(candidates.map(c=>[c.id,c]));const seen=new Set<string>();
 return value.map((item,index)=>{
  const path='/options/reviewedChanges/'+index;
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(path+': expected reviewed change object');
  const x=item as Record<string,unknown>,keys=Object.keys(x).sort(),allowed=['conversion','id','kind','newDigest','oldDigest','path'].sort();
  if(keys.some(k=>!allowed.includes(k))||!['id','kind','path','oldDigest','newDigest'].every(k=>Object.hasOwn(x,k)))throw new Error(path+': unknown or missing marker member');
  if(typeof x.id!=='string'||!safeId(x.id)||typeof x.kind!=='string'||typeof x.path!=='string'||typeof x.oldDigest!=='string'||typeof x.newDigest!=='string'||!/^[a-f0-9]{64}$/.test(x.oldDigest)||!/^[a-f0-9]{64}$/.test(x.newDigest)||(x.conversion!==undefined&&(typeof x.conversion!=='string'||!x.conversion.length||x.conversion.length>128)))throw new Error(path+': invalid marker identity or digest');
  const candidate=byId.get(x.id);
  if(!candidate||candidate.kind!==x.kind||candidate.path!==x.path||candidate.oldDigest!==x.oldDigest||candidate.newDigest!==x.newDigest)throw new Error(path+': marker does not bind an exact source change');
  if(seen.has(x.id))throw new Error(path+': duplicate marker');seen.add(x.id);
  const {oldValue:_old,newValue:_new,...marker}=candidate;
  if(x.conversion!==undefined)return {...marker,conversion:x.conversion};return marker;
 });
}
