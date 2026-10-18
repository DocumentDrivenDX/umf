export type Kind='schema'|'extension'|'api'|'integration'|'example'|'guide';
export interface Source {path:string;sha256:string;bytes:number;revision?:string;pointer?:string;line?:number}
export interface Entry {id:string;kind:Kind;title:string;summary:string;sources:Source[];links:string[];data:Record<string,any>}
export interface Summary {id:string;kind:Kind;title:string;summary:string;href:string;sha256:string;bytes:number}
export interface ReferenceIndex {profile:'umf.reference/1';entries:Summary[];inputDigest:string}
export type Outcome='passed'|'failed'|'mixed'|'skipped'|'unassessed';
export type Correspondence='matching'|'historical'|'unknown'|'unassessed';
export interface Evidence {id:string;source:Source;readerId:string;selector:string;outcome:Outcome;correspondence:Correspondence;scope:string;versions:Record<string,string>;limitations:string[];commands:string[];inputHashes:{path:string;sha256:string}[];closureComplete:boolean;supersedes:string[];observedAt?:string}
export const identity=(...parts:string[])=>JSON.stringify(parts);
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function search(entries:Summary[],query:string,kind?:Kind):Summary[] {
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return entries.filter(e=>(!kind||e.kind===kind)&&words.every(w=>(e.title+' '+e.summary+' '+e.id).toLowerCase().includes(w)));
}
export function assertJoins(entries:Entry[]):void {
 const ids=new Set<string>();for(const e of entries){if(ids.has(e.id))throw Error('REFERENCE_STRUCTURE duplicate '+e.id);ids.add(e.id);}
 for(const e of entries)for(const id of e.links)if(!ids.has(id))throw Error('REFERENCE_LINK '+e.id+' → '+id);
}
export function exclude(entries:Entry[],rules:{path:string;reason:string}[]){
 const paths=new Set(entries.flatMap(e=>e.sources.map(s=>s.path)));const seen=new Set<string>();
 for(const rule of rules){if(!paths.has(rule.path)||!rule.reason.trim()||seen.has(rule.path))throw Error('REFERENCE_LINK invalid exclusion '+rule.path);seen.add(rule.path);}
 return entries.filter(e=>!e.sources.some(s=>seen.has(s.path)));
}
export function aggregate(evidence:Evidence[]):{correspondence:Correspondence|'conflicting';conflicts:string[][]} {
 const ids=new Map(evidence.map(e=>[e.id,e]));
 const visit=(id:string,seen=new Set<string>())=>{if(seen.has(id))throw Error('REFERENCE_LINK cyclic supersession');const e=ids.get(id);if(!e)throw Error('REFERENCE_LINK missing superseded record');for(const other of e.supersedes){if(!ids.has(other))throw Error('REFERENCE_LINK missing superseded record');if(ids.get(other)?.scope!==e.scope)throw Error('REFERENCE_LINK supersession scope mismatch');visit(other,new Set([...seen,id]));}};
 evidence.forEach(e=>visit(e.id));
 const superseded=new Set(evidence.flatMap(e=>e.supersedes));const active=evidence.filter(e=>!superseded.has(e.id));const conflicts:string[][]=[];
 for(let i=0;i<active.length;i++)for(const b of active.slice(i+1)){const a=active[i]!;if(a.scope===b.scope&&canonical(a.versions??{})===canonical(b.versions??{})&&a.outcome!==b.outcome&&a.outcome!=='unassessed'&&b.outcome!=='unassessed')conflicts.push([a.id,b.id]);}
 const correspondence=conflicts.length?'conflicting':!active.length?'unassessed':active.some(e=>e.correspondence==='historical')?'historical':active.some(e=>e.correspondence!=='matching')?'unknown':'matching';
 return {correspondence,conflicts};
}
export interface Difference {pointer:string;change:'added'|'removed'|'changed';before?:unknown;after?:unknown}
export function structuralDiff(before:unknown,after:unknown,pointer='',depth=0):Difference[] {
 if(depth>128)throw Error('REFERENCE_LIMIT comparison depth');if(canonical(before)===canonical(after))return [];
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(k=>structuralDiff((before as any)[k],(after as any)[k],pointer+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),depth+1));
 return [{pointer,change:before===undefined?'added':after===undefined?'removed':'changed',...(before===undefined?{}:{before}),...(after===undefined?{}:{after})}];
}
export {compareVersions,latestProfile,treeValue,pointerPart,schemaNode,resolveSchema,shape,schemaRules,propertyPresence,unknownKeyPolicy} from './reader';
export type {ReaderCatalog,ApiReader,ReaderRow,Concept} from './reader';
export {selfModelGraph} from './metamodel';
export type {SelfModelCatalog} from './metamodel';
