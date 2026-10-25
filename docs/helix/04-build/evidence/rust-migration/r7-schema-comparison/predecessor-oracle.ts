// Frozen TypeScript test oracle. Production schema-browser builds use only the
// initialized Rust/WASM comparison engine.
import {copyJson} from '../../../../../../src/model/json';

export interface PredecessorChange {path:string;status:'created'|'changed'|'removed';before?:unknown;after?:unknown}

export function compareDocumentsPredecessor(before:unknown,after:unknown):PredecessorChange[]{
 before=copyJson(before);after=copyJson(after);const changes:PredecessorChange[]=[];const escape=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
 const walk=(a:any,b:any,path:string)=>{if(JSON.stringify(a)===JSON.stringify(b))return;if(a===undefined){changes.push({path,status:'created',after:b});return;}if(b===undefined){changes.push({path,status:'removed',before:a});return;}
  if(Array.isArray(a)&&Array.isArray(b)&&[...a,...b].every(x=>x&&typeof x==='object'&&typeof x.id==='string')&&new Set(a.map(x=>x.id)).size===a.length&&new Set(b.map(x=>x.id)).size===b.length){if(a.map(x=>x.id).filter(id=>b.some(x=>x.id===id)).join('\u0000')!==b.map(x=>x.id).filter(id=>a.some(x=>x.id===id)).join('\u0000'))changes.push({path:path+'/order',status:'changed',before:a.map(x=>x.id),after:b.map(x=>x.id)});const aa=new Map(a.map(x=>[x.id,x])),bb=new Map(b.map(x=>[x.id,x]));for(const id of new Set([...aa.keys(),...bb.keys()]))walk(aa.get(id),bb.get(id),path+'/id:'+escape(id));return;}
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(Object.hasOwn(a,k)?a[k]:undefined,Object.hasOwn(b,k)?b[k]:undefined,path+'/'+escape(k));return;}changes.push({path,status:'changed',before:a,after:b});};walk(before,after,'');return changes;
}
