// SPDX-License-Identifier: MIT OR Apache-2.0
import {canonical,hashCanonical,sha256Text} from '../compilation/bundle/hash';
import {readDocument} from '../model/document';
import {UmfError} from '../model/types';
import type {TableDeploymentBundle} from '../table-deployment';
import {discoverG03DefaultChanges} from './g03-defaults';

export type ReviewedChangeKind='drop-column'|'rename-column'|'change-column-type'|'tighten-not-null'|'relax-not-null'|'replace-check'|'replace-foreign-key'|'replace-index'|'replace-primary-key'|'change-policy'|'change-default'|'change-operation'|'change-operation-context';
export interface ReviewedChangeMarker {
 id:string;kind:ReviewedChangeKind;path:string;oldDigest:string;newDigest:string;conversion?:string;
}
export interface ReviewedChangeCandidate extends ReviewedChangeMarker {oldValue:unknown;newValue:unknown;oldPath?:string|null;newPath?:string|null}
export interface TableMigrationDiscoverySelector {version:'umf.table-migration-discovery/0.2'|'umf.table-migration-discovery/0.3'}
export const reviewedValueDigest=(value:unknown):string=>hashCanonical(value===undefined?null:value);
const safeId=(value:string):boolean=>!!value&&value.length<=128&&!value.includes('\0');

/** Source-bound marker candidates. Candidates only identify changes; compiler support is checked independently. */
export function discoverTableMigrationChanges(previous:TableDeploymentBundle,next:TableDeploymentBundle,selector?:TableMigrationDiscoverySelector):ReviewedChangeCandidate[]{
 if(selector!==undefined&&(!selector||typeof selector!=='object'||Object.keys(selector).length!==1||!['umf.table-migration-discovery/0.2','umf.table-migration-discovery/0.3'].includes(selector.version)))throw new Error('Unknown table-migration discovery selector');
 if(selector!==undefined){
  if(previous.source.format!=='json')throw new UmfError('TABLE_MIGRATION_OPTIONS',selector.version==='umf.table-migration-discovery/0.3'?'Version 0.3 discovery requires exact JSON retained sources':'Version 0.2 discovery requires exact JSON retained sources','/previous/source/format');
  if(next.source.format!=='json')throw new UmfError('TABLE_MIGRATION_OPTIONS',selector.version==='umf.table-migration-discovery/0.3'?'Version 0.3 discovery requires exact JSON retained sources':'Version 0.2 discovery requires exact JSON retained sources','/next/source/format');
 }
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
   if(!old.nullable&&fresh.nullable)add('relax-not-null',path,oldMeaning,newMeaning);
  }
  for(const kind of ['checks','foreignKeys','indexes','keys'] as const){
   const oldItems=(previous.expectedCatalog[kind] as {table:string;id:string}[]).filter(x=>x.table===oldTable.id),newItems=(next.expectedCatalog[kind] as {table:string;id:string}[]).filter(x=>x.table===oldTable.id);
   for(const old of oldItems){const fresh=by(newItems,old.id),tableIndex=next.expectedCatalog.tables.findIndex(t=>t.id===oldTable.id),decl=next.expectedCatalog.tables[tableIndex] as any;
    const list=kind==='keys'?[]:decl[kind],oldList=(previous.expectedCatalog.tables.find(t=>t.id===oldTable.id) as any)[kind];
    const moduleIndex=readModuleIndex(next),module=next.expectedCatalog.tables.find(t=>t.id===oldTable.id)!.record.module;
    const recordIndex=newDocument.modules.find(m=>m.id===module)?.elements.findIndex(e=>e.id===decl.record.element)??0;
    const logicalOld=oldDocument.modules.find(m=>m.id===module)?.elements.find(e=>e.id===decl.record.element) as any;
    const logicalNew=newDocument.modules.find(m=>m.id===module)?.elements.find(e=>e.id===decl.record.element) as any;
    const oldLogical=kind==='keys'?(logicalOld?.keys??[]).find((x:any)=>x.id===old.id):undefined,newLogical=kind==='keys'?(logicalNew?.keys??[]).find((x:any)=>x.id===fresh?.id):undefined;
    const domainColumn=(bundle:TableDeploymentBundle,item:{id:string;table:string})=>kind==='checks'&&selector?.version==='umf.table-migration-discovery/0.3'&&item.id.startsWith('domain:')?bundle.expectedCatalog.columns.find(column=>column.table===item.table&&'domain:'+column.field.module+'.'+column.field.element===item.id):undefined;
    const oldDomain=domainColumn(previous,old),newDomain=fresh?domainColumn(next,fresh):undefined;
    const itemIndex=kind==='keys'?(selector?.version==='umf.table-migration-discovery/0.3'&&fresh?(logicalNew?.keys??[]).indexOf(newLogical):(logicalOld?.keys??[]).indexOf(oldLogical)):(fresh?list:oldList).findIndex((x:any)=>x.id===old.id);
    const path=kind==='keys'?'/modules/'+moduleIndex+'/elements/'+recordIndex+'/keys/'+itemIndex:newDomain?newDomain.sourcePath+'/domain':oldDomain?oldDomain.sourcePath+'/domain':'/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/'+kind+'/'+itemIndex;
    if(canonical(old)===canonical(fresh??null)&&selector?.version!=='umf.table-migration-discovery/0.3')continue;
    const rk:ReviewedChangeKind=kind==='checks'?'replace-check':kind==='foreignKeys'?'replace-foreign-key':kind==='indexes'?'replace-index':'replace-primary-key';
    const domainMeaning=(bundle:TableDeploymentBundle,item:{id:string;table:string},column:TableDeploymentBundle['expectedCatalog']['columns'][number]|undefined):unknown=>{
     if(!column)return null;
     const source=readDocument(bundle.source.utf8,bundle.source.format),field=source.modules.find(m=>m.id===column.field.module)?.elements.find(e=>e.id===column.field.element),table=bundle.expectedCatalog.tables.find(t=>t.id===item.table),mapping=table?.columns.find(c=>fieldId(c)===fieldId(column));
     return {physical:item,logical:{column:mapping??null,field:field??null}};
    };
    const oldPath=oldDomain?oldDomain.sourcePath+'/domain':kind==='keys'?'/modules/'+readModuleIndex(previous)+'/elements/'+(oldDocument.modules.find(m=>m.id===module)?.elements.findIndex(e=>e.id===decl.record.element)??0)+'/keys/'+(logicalOld?.keys??[]).indexOf(oldLogical):'/modules/'+readModuleIndex(previous)+'/extensions/umf.tables/tables/'+previous.expectedCatalog.tables.findIndex(t=>t.id===oldTable.id)+'/'+kind+'/'+oldList.findIndex((x:any)=>x.id===old.id);
    const newPath=fresh?(newDomain?newDomain.sourcePath+'/domain':kind==='keys'?'/modules/'+moduleIndex+'/elements/'+recordIndex+'/keys/'+(logicalNew?.keys??[]).indexOf(newLogical):'/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/'+kind+'/'+list.findIndex((x:any)=>x.id===old.id)):null;
    const prior=result.length;
    add(rk,path,kind==='keys'?{physical:old,logical:oldLogical??null}:oldDomain?domainMeaning(previous,old,oldDomain):{physical:old,logical:(oldList??[]).find((x:any)=>x.id===old.id)??null},kind==='keys'?{physical:fresh??null,logical:newLogical??null}:newDomain?domainMeaning(next,fresh!,newDomain):{physical:fresh??null,logical:(list??[]).find((x:any)=>x.id===old.id)??null});
    if(selector?.version==='umf.table-migration-discovery/0.3'&&result.length>prior){const candidate=result[result.length-1]!;candidate.oldPath=oldPath;candidate.newPath=newPath;}
   }
   if(selector?.version==='umf.table-migration-discovery/0.3')for(const fresh of newItems){if(oldItems.some(old=>old.id===fresh.id))continue;
    const tableIndex=next.expectedCatalog.tables.findIndex(t=>t.id===oldTable.id),decl=next.expectedCatalog.tables[tableIndex] as any,module=decl.record.module;
    const recordIndex=newDocument.modules.find(m=>m.id===module)?.elements.findIndex(e=>e.id===decl.record.element)??0;
    const logicalRecord=newDocument.modules.find(m=>m.id===module)?.elements[recordIndex] as any;
    const list=kind==='keys'?[]:decl[kind],logical=kind==='keys'?(logicalRecord?.keys??[]).find((x:any)=>x.id===fresh.id):(list??[]).find((x:any)=>x.id===fresh.id);
    const itemIndex=kind==='keys'?(logicalRecord?.keys??[]).indexOf(logical):list.findIndex((x:any)=>x.id===fresh.id);
    const domainColumn=kind==='checks'&&selector?.version==='umf.table-migration-discovery/0.3'&&fresh.id.startsWith('domain:')?next.expectedCatalog.columns.find(column=>column.table===fresh.table&&'domain:'+column.field.module+'.'+column.field.element===fresh.id):undefined;
    const path=kind==='keys'?'/modules/'+readModuleIndex(next)+'/elements/'+recordIndex+'/keys/'+itemIndex:domainColumn?domainColumn.sourcePath+'/domain':'/modules/'+readModuleIndex(next)+'/extensions/umf.tables/tables/'+tableIndex+'/'+kind+'/'+itemIndex;
    const rk:ReviewedChangeKind=kind==='checks'?'replace-check':kind==='foreignKeys'?'replace-foreign-key':kind==='indexes'?'replace-index':'replace-primary-key';
    const prior=result.length;
    let meaning:unknown={physical:fresh,logical:logical??null};
    if(domainColumn){const field=newDocument.modules.find((m:any)=>m.id===domainColumn.field.module)?.elements.find((e:any)=>e.id===domainColumn.field.element),mapping=decl.columns.find((column:any)=>fieldId(column)===fieldId(domainColumn));meaning={physical:fresh,logical:{column:mapping??null,field:field??null}};}
    add(rk,path,null,meaning);
    if(result.length>prior){const candidate=result[result.length-1]!;candidate.oldPath=null;candidate.newPath=path;}
   }
  }
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){
   const before=oldTable.policy[audience][command],after=freshTable.policy[audience][command];if(canonical(before)!==canonical(after))add('change-policy','/modules/'+readModuleIndex(next)+'/extensions/umf.tables/tables/'+next.expectedCatalog.tables.indexOf(freshTable)+'/policy/'+audience+'/'+command,before,after);
  }
 }
 if(selector?.version==='umf.table-migration-discovery/0.2'){
  result.push(...discoverG03DefaultChanges(previous,next));
 }
 if(selector?.version==='umf.table-migration-discovery/0.3'){
  result.push(...discoverG03DefaultChanges(previous,next));
  const oldSourceSha256=sha256Text(previous.source.utf8),newSourceSha256=sha256Text(next.source.utf8);
  const context=(bundle:TableDeploymentBundle,sha256:string,module:string,operation:unknown)=>({version:'umf.table-operation-source-context/0.1',source:{format:bundle.source.format,sha256},configuration:bundle.configuration,module,operation});
  const oldCommandSets=oldDocument.modules.flatMap((module:any,moduleIndex:number)=>{
   const payload=module.extensions?.['umf.tables'] as {commands?:unknown[]}|undefined;
   return (payload?.commands??[]).map((operation,index)=>({module:module.id,moduleIndex,index,operation}));
  });
  const newCommandSets=newDocument.modules.flatMap((module:any,moduleIndex:number)=>{
   const payload=module.extensions?.['umf.tables'] as {commands?:unknown[]}|undefined;
   return (payload?.commands??[]).map((operation,index)=>({module:module.id,moduleIndex,index,operation}));
  });
  const commandId=(value:unknown):string|undefined=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof (value as {id?:unknown}).id==='string'&&!!(value as {id:string}).id?(value as {id:string}).id:undefined;
  const indexByIdentity=(entries:typeof oldCommandSets):Map<string,typeof oldCommandSets[number]>=>{
   const indexed=new Map<string,typeof oldCommandSets[number]>();
   for(const entry of entries){const id=commandId(entry.operation);if(id===undefined)continue;const identity=JSON.stringify([entry.module,id]);if(indexed.has(identity))throw new UmfError('TABLE_MIGRATION_OPTIONS','Duplicate operation identity prevents unambiguous source correspondence','/modules/'+entry.moduleIndex+'/extensions/umf.tables/commands/'+entry.index);indexed.set(identity,entry);}
   return indexed;
  };
  const oldByIdentity=indexByIdentity(oldCommandSets),newByIdentity=indexByIdentity(newCommandSets);
  const identities=[...new Set([...oldByIdentity.keys(),...newByIdentity.keys()])].sort();
  for(const identity of identities){
   const oldEntry=oldByIdentity.get(identity),newEntry=newByIdentity.get(identity),oldPresent=oldEntry!==undefined,newPresent=newEntry!==undefined,before=oldEntry?.operation,after=newEntry?.operation;
   if(oldPresent&&newPresent&&canonical(before)===canonical(after))continue;
   const entry=newEntry??oldEntry!,path='/modules/'+entry.moduleIndex+'/extensions/umf.tables/commands/'+entry.index;
   const prior= result.length;
   add('change-operation',path,before??null,after??null);
   if(result.length>prior){const candidate=result[result.length-1]!;candidate.oldPath=oldEntry?'/modules/'+oldEntry.moduleIndex+'/extensions/umf.tables/commands/'+oldEntry.index:null;candidate.newPath=newEntry?'/modules/'+newEntry.moduleIndex+'/extensions/umf.tables/commands/'+newEntry.index:null;}
  }
  const changed=new Set(identities.filter(id=>!oldByIdentity.has(id)||!newByIdentity.has(id)||canonical(oldByIdentity.get(id)?.operation)!==canonical(newByIdentity.get(id)?.operation)));
  for(const identity of identities){
   if(changed.has(identity))continue;
   const before=oldByIdentity.get(identity)!,after=newByIdentity.get(identity)!;
   const operation=before.operation;
   const oldContext=context(previous,oldSourceSha256,before.module,operation),newContext=context(next,newSourceSha256,after.module,after.operation);
   if(canonical(oldContext)===canonical(newContext))continue;
   const path='/modules/'+after.moduleIndex+'/extensions/umf.tables/commands/'+after.index;
   const prior=result.length;add('change-operation-context',path,oldContext,newContext);
   if(result.length>prior){const candidate=result[result.length-1]!;candidate.oldPath='/modules/'+before.moduleIndex+'/extensions/umf.tables/commands/'+before.index;candidate.newPath='/modules/'+after.moduleIndex+'/extensions/umf.tables/commands/'+after.index;}
  }
 }
 return result;
}
function readModuleIndex(bundle:TableDeploymentBundle):number{
 try{return readDocument(bundle.source.utf8,bundle.source.format).modules.findIndex(x=>x.id===bundle.module);}catch{return 0;}
}
export function validateReviewedChangeMarkers(value:unknown,previous:TableDeploymentBundle,next:TableDeploymentBundle,selector?:TableMigrationDiscoverySelector):ReviewedChangeMarker[]{
 if(!Array.isArray(value)||value.length>512)throw new Error('reviewedChanges must be an array of at most512 exact markers');
 const candidates=discoverTableMigrationChanges(previous,next,selector),byId=new Map(candidates.map(c=>[c.id,c]));const seen=new Set<string>();
 return value.map((item,index)=>{
  const path='/options/reviewedChanges/'+index;
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(path+': expected reviewed change object');
  const x=item as Record<string,unknown>,keys=Object.keys(x).sort(),allowed=['conversion','id','kind','newDigest','oldDigest','path'].sort();
  if(keys.some(k=>!allowed.includes(k))||!['id','kind','path','oldDigest','newDigest'].every(k=>Object.hasOwn(x,k)))throw new Error(path+': unknown or missing marker member');
  if(typeof x.id!=='string'||!safeId(x.id)||typeof x.kind!=='string'||typeof x.path!=='string'||typeof x.oldDigest!=='string'||typeof x.newDigest!=='string'||!/^[a-f0-9]{64}$/.test(x.oldDigest)||!/^[a-f0-9]{64}$/.test(x.newDigest)||(x.conversion!==undefined&&(typeof x.conversion!=='string'||!x.conversion.length||x.conversion.length>128)))throw new Error(path+': invalid marker identity or digest');
  const candidate=byId.get(x.id);
  if(!candidate||candidate.kind!==x.kind||candidate.path!==x.path||candidate.oldDigest!==x.oldDigest||candidate.newDigest!==x.newDigest)throw new Error(path+': marker does not bind an exact source change');
  if(seen.has(x.id))throw new Error(path+': duplicate marker');seen.add(x.id);
  const {oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker}=candidate;
  if(x.conversion!==undefined)return {...marker,conversion:x.conversion};return marker;
 });
}
