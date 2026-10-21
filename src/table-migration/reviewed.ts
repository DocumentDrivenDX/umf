// SPDX-License-Identifier: MIT OR Apache-2.0
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {readDocument} from '../model/document';
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
 const result:ReviewedChangeCandidate[]=[];
 const oldDocument=readDocument(previous.source.utf8,previous.source.format),newDocument=readDocument(next.source.utf8,next.source.format);
 const add=(kind:ReviewedChangeKind,path:string,a:unknown,b:unknown):void=>{
  if(canonical(a??null)===canonical(b??null))return;
  const oldDigest=reviewedValueDigest(a),newDigest=reviewedValueDigest(b),id='review-'+hashCanonical([kind,path,oldDigest,newDigest]).slice(0,24);
  result.push({id,kind,path,oldDigest,newDigest,oldValue:a??null,newValue:b??null});
 };
 const by=(items:readonly {id:string;table:string}[],id:string)=>items.find(item=>item.id===id);
 for(const oldTable of previous.expectedCatalog.tables){
  const freshTable=next.expectedCatalog.tables.find(t=>t.id===oldTable.id);if(!freshTable)continue;
  const oldCols=previous.expectedCatalog.columns.filter(c=>c.table===oldTable.id),newCols=next.expectedCatalog.columns.filter(c=>c.table===oldTable.id);
  const fieldId=(x:{field:{module:string;element:string}})=>JSON.stringify([x.field.module,x.field.element]);
  for(const old of oldCols){const fresh=newCols.find(c=>fieldId(c)===fieldId(old));const path=fresh?.sourcePath??old.sourcePath;
   const oldMapping=oldTable.columns.find(c=>fieldId(c)===fieldId(old)),newMapping=fresh&&freshTable.columns.find(c=>fieldId(c)===fieldId(fresh));
   const oldField=oldDocument.modules.find(m=>m.id===old.field.module)?.elements.find(e=>e.id===old.field.element),newField=fresh&&newDocument.modules.find(m=>m.id===fresh.field.module)?.elements.find(e=>e.id===fresh.field.element);
   const seeds=previous.seedSets.flatMap(set=>set.rows.filter(row=>row.table===old.table).flatMap(row=>row.values.filter(value=>fieldId(value)===fieldId(old))));
   const oldMeaning={physical:old,logical:oldField??null,mapping:oldMapping??null,...(!fresh?{seedValues:seeds}:{})},newMeaning=fresh?{physical:fresh,logical:newField??null,mapping:newMapping??null}:null;
   if(!fresh){add('drop-column',path,oldMeaning,newMeaning);continue;}
   if(old.name!==fresh.name)add('rename-column',path,oldMeaning,newMeaning);
   if(canonical({typeSchema:old.typeSchema,typeName:old.typeName,typeMod:old.typeMod})!==canonical({typeSchema:fresh.typeSchema,typeName:fresh.typeName,typeMod:fresh.typeMod}))add('change-column-type',path,oldMeaning,newMeaning);
   if(old.nullable&&!fresh.nullable)add('tighten-not-null',path,oldMeaning,newMeaning);
  }
  for(const kind of ['checks','foreignKeys','indexes','keys'] as const){
   const oldItems=(previous.expectedCatalog[kind] as {table:string;id:string}[]).filter(x=>x.table===oldTable.id),newItems=(next.expectedCatalog[kind] as {table:string;id:string}[]).filter(x=>x.table===oldTable.id);
   for(const old of oldItems){const fresh=by(newItems,old.id),tableIndex=next.expectedCatalog.tables.findIndex(t=>t.id===oldTable.id),decl=next.expectedCatalog.tables[tableIndex] as any;
    const list=kind==='keys'?[]:decl[kind],oldList=(previous.expectedCatalog.tables.find(t=>t.id===oldTable.id) as any)[kind];
    const itemIndex=(fresh?list:oldList).findIndex((x:any)=>x.id===old.id),moduleIndex=readModuleIndex(next),module=next.expectedCatalog.tables.find(t=>t.id===oldTable.id)!.record.module;
    const recordIndex=newDocument.modules.find(m=>m.id===module)?.elements.findIndex(e=>e.id===decl.record.element)??0;
    const path=kind==='keys'?'/modules/'+moduleIndex+'/elements/'+recordIndex+'/keys/'+itemIndex:'/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/'+kind+'/'+itemIndex;
    if(canonical(old)===canonical(fresh??null))continue;
    const rk:ReviewedChangeKind=kind==='checks'?'replace-check':kind==='foreignKeys'?'replace-foreign-key':kind==='indexes'?'replace-index':'replace-primary-key';add(rk,path,old,fresh??null);
   }
  }
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){
   const before=oldTable.policy[audience][command],after=freshTable.policy[audience][command];if(canonical(before)!==canonical(after))add('change-policy','/modules/'+readModuleIndex(next)+'/extensions/umf.tables/tables/'+next.expectedCatalog.tables.indexOf(freshTable)+'/policy/'+audience+'/'+command,before,after);
  }
 }
 return result;
}
function readModuleIndex(bundle:TableDeploymentBundle):number{
 try{return readDocument(bundle.source.utf8,bundle.source.format).modules.findIndex(x=>x.id===bundle.module);}catch{return 0;}
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
