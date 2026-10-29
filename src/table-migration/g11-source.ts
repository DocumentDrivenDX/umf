// SPDX-License-Identifier: MIT OR Apache-2.0
import {canonical} from '../compilation/bundle/hash';
import {copyJson} from '../model/json';
import {readDocument} from '../model/document';
import type {TableDeploymentBundle} from '../table-deployment';
import type {ReviewedChangeMarker} from './reviewed';
import {discoverTableMigrationChanges} from './reviewed';

const same=(a:unknown,b:unknown):boolean=>canonical(a)===canonical(b);
const refKey=(value:{module:string;element:string})=>JSON.stringify([value.module,value.element]);
const without=(value:Record<string,unknown>,keys:string[])=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
const fail=(message:string,path:string):never=>{throw Object.assign(new Error(message),{code:'TABLE_MIGRATION_UNSUPPORTED',path});};

/**
 * Validate the exact closed source delta for the first G11 compiler branch.
 * Selected Field objects and operation declarations are never normalized as
 * whole documents: every retained object/array is compared in authored order.
 */
export function validateG11SourceCorrespondence(previous:TableDeploymentBundle,next:TableDeploymentBundle,markers:readonly ReviewedChangeMarker[]):{removed:TableDeploymentBundle['expectedCatalog']['columns'];added:TableDeploymentBundle['expectedCatalog']['columns']} {
 if(previous.source.format!=='json')fail('G11 requires exact retained JSON sources','/previous/source/format');
 if(next.source.format!=='json')fail('G11 requires exact retained JSON sources','/next/source/format');
 if(previous.module!==next.module||!same(previous.configuration,next.configuration)||previous.profile!==next.profile)fail('G11 preserves module, complete native configuration and deployment profile','/next/configuration');
 const oldDoc=readDocument(previous.source.utf8,'json') as any,newDoc=readDocument(next.source.utf8,'json') as any;
 if(!same({...oldDoc,modules:[]},{...newDoc,modules:[]}))fail('G11 does not change root metadata or vocabularies','/next/source');
 if(oldDoc.modules.length!==newDoc.modules.length)fail('G11 preserves the complete module inventory','/next/source/modules');
 const oldModuleIndex=oldDoc.modules.findIndex((m:any)=>m.id===previous.module),newModuleIndex=newDoc.modules.findIndex((m:any)=>m.id===next.module);
 if(oldModuleIndex<0||newModuleIndex!==oldModuleIndex)fail('G11 requires the same selected module at the same source position','/next/source/modules');
 const oldModule=oldDoc.modules[oldModuleIndex],newModule=newDoc.modules[newModuleIndex];
 const oldPayload=oldModule.extensions?.['umf.tables'],newPayload=newModule.extensions?.['umf.tables'];
 if(!oldPayload||!newPayload)fail('G11 requires the retained table extension on both sides','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables');
 if(!same(without(oldPayload,['tables','seedSets','commands']),without(newPayload,['tables','seedSets','commands'])))fail('G11 preserves the complete table-extension profile and unknown members','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables');
 for(let i=0;i<oldDoc.modules.length;i++)if(i!==oldModuleIndex&&!same(oldDoc.modules[i],newDoc.modules[i]))fail('G11 rejects unselected-module changes','/next/source/modules/'+i);
 if(!same(without(oldModule,['elements','extensions']),without(newModule,['elements','extensions'])))fail('G11 preserves selected module metadata','/next/source/modules/'+newModuleIndex);
 if(!same(without(oldModule.extensions??{},['umf.tables']),without(newModule.extensions??{},['umf.tables'])))fail('G11 preserves unknown module extensions','/next/source/modules/'+newModuleIndex+'/extensions');

 const oldElements=oldModule.elements as any[],newElements=newModule.elements as any[];
 const oldById=new Map(oldElements.map((e:any)=>[e.id,e])),newById=new Map(newElements.map((e:any)=>[e.id,e]));
 const removedIds=new Set(oldElements.filter((e:any)=>e.kind==='field'&&!newById.has(e.id)).map((e:any)=>refKey({module:previous.module,element:e.id})));
 const addedIds=new Set(newElements.filter((e:any)=>e.kind==='field'&&!oldById.has(e.id)).map((e:any)=>refKey({module:next.module,element:e.id})));
 const candidates=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}),markerIds=new Set(markers.map(item=>item.id));
 const compareDependencies=(oldItems:any[],newItems:any[],kind:'replace-check'|'replace-foreign-key'|'replace-index'|'replace-primary-key',oldPath:(index:number)=>string,newPath:(index:number)=>string,location:string)=>{
  const ids=[...new Set([...oldItems.map(item=>item.id),...newItems.map(item=>item.id)])],changed=new Set<string>();
  for(const id of ids){const oldIndex=oldItems.findIndex(item=>item.id===id),newIndex=newItems.findIndex(item=>item.id===id),before=oldIndex<0?null:oldItems[oldIndex],after=newIndex<0?null:newItems[newIndex];if(same(before,after))continue;
   const beforePath=oldIndex<0?null:oldPath(oldIndex),afterPath=newIndex<0?null:newPath(newIndex),candidate=candidates.find(item=>item.kind===kind&&item.oldPath===beforePath&&item.newPath===afterPath);
   if(!candidate||!markerIds.has(candidate.id))fail('Changed native dependency requires its exact source-side review marker',afterPath??beforePath??location);changed.add(id);
  }
  if(!same(oldItems.filter(item=>!changed.has(item.id)),newItems.filter(item=>!changed.has(item.id))))fail('G11 preserves unchanged dependency meaning and authored order',location);
 };
 const oldKept=oldElements.filter((e:any)=>!removedIds.has(refKey({module:previous.module,element:e.id})));
 const newKept=newElements.filter((e:any)=>!addedIds.has(refKey({module:next.module,element:e.id})));
 const retainedElementMeaning=(items:any[])=>items.map(e=>e.kind==='record'?without(e,['members','keys']):e);
 if(!same(retainedElementMeaning(oldKept),retainedElementMeaning(newKept)))fail('G11 permits only complete Field removal/addition and selected Record membership changes','/next/source/modules/'+newModuleIndex+'/elements');
 for(const old of oldElements)if(old.kind!=='field'&&newById.has(old.id)){
  const fresh=newById.get(old.id);
  if(old.kind!=='record'||fresh?.kind!=='record')continue;
  if(!same(without(old,['members','keys']),without(fresh,['members','keys'])))fail('G11 preserves retained Record meaning','/next/source/modules/'+newModuleIndex+'/elements/'+newElements.indexOf(fresh));
  const mappingOnlyDrops=new Set((oldPayload.tables as any[]).filter((table:any)=>table.record.module===previous.module&&table.record.element===old.id).flatMap((table:any)=>table.columns.filter((column:any)=>!(newPayload.tables.find((item:any)=>item.id===table.id)?.columns??[]).some((item:any)=>refKey(item.field)===refKey(column.field))&&!newPayload.tables.some((item:any)=>item.record.module===previous.module&&item.record.element===old.id&&item.columns.some((mapping:any)=>refKey(mapping.field)===refKey(column.field)))).map((column:any)=>refKey(column.field))));
  const before=(old.members??[]).filter((r:any)=>!removedIds.has(refKey(r))&&!mappingOnlyDrops.has(refKey(r))),after=(fresh.members??[]).filter((r:any)=>!addedIds.has(refKey(r)));
  const addedMembers=(fresh.members??[]).filter((r:any)=>!before.some((kept:any)=>refKey(kept)===refKey(r)));
  if(!same(before,after)||addedMembers.some((r:any)=>!addedIds.has(refKey(r)))||addedMembers.some((r:any)=>!newPayload.tables.some((table:any)=>table.record.module===previous.module&&table.record.element===fresh.id&&table.columns.some((column:any)=>refKey(column.field)===refKey(r)))))fail('G11 Record membership may only remove selected old Fields and add newly mapped Fields','/next/source/modules/'+newModuleIndex+'/elements/'+newElements.indexOf(fresh)+'/members');
  const keyPath=(index:number,documentModuleIndex:number,elements:any[])=>'/modules/'+documentModuleIndex+'/elements/'+elements.findIndex((item:any)=>item.id===old.id)+'/keys/'+index;
  compareDependencies(old.keys??[],fresh.keys??[],'replace-primary-key',i=>keyPath(i,oldModuleIndex,oldElements),i=>keyPath(i,newModuleIndex,newElements),'/next/source/modules/'+newModuleIndex+'/elements/'+newElements.indexOf(fresh)+'/keys');
 }
 if(!same(oldPayload.seedSets,newPayload.seedSets))fail('G11 requires the complete authored seedSets array to remain unchanged','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/seedSets');
 if(oldPayload.tables.length!==newPayload.tables.length)fail('G11 preserves table inventory','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/tables');
 const removed:TableDeploymentBundle['expectedCatalog']['columns']=[],added:TableDeploymentBundle['expectedCatalog']['columns']=[];
 for(const [ti,oldTable] of oldPayload.tables.entries()){
  const fresh=newPayload.tables[ti];
  if(!fresh||oldTable.id!==fresh.id||oldTable.name!==fresh.name||!same(oldTable.record,fresh.record))fail('G11 preserves table identity, name and Record','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/tables/'+ti);
  if(!same(without(oldTable,['columns','checks','foreignKeys','indexes','policy']),without(fresh,['columns','checks','foreignKeys','indexes','policy'])))fail('G11 preserves table identity and unknown table members','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/tables/'+ti);
  const oldRefs=new Set((oldTable.columns??[]).map((x:any)=>refKey(x.field))),newRefs=new Set((fresh.columns??[]).map((x:any)=>refKey(x.field)));
  const removedMappings=(oldTable.columns??[]).filter((x:any)=>!newRefs.has(refKey(x.field))),addedMappings=(fresh.columns??[]).filter((x:any)=>!oldRefs.has(refKey(x.field)));
  const oldRetained=(oldTable.columns??[]).filter((x:any)=>newRefs.has(refKey(x.field))),newRetained=(fresh.columns??[]).filter((x:any)=>oldRefs.has(refKey(x.field)));
  if(!same(oldRetained,newRetained))fail('G11 preserves every retained native mapping and its authored relative order','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/tables/'+ti+'/columns');
  for(const mapping of removedMappings){
   const expected=previous.expectedCatalog.columns.find(c=>c.table===oldTable.id&&refKey(c.field)===refKey(mapping.field));
   if(!expected)fail('Removed Field mapping is absent from predecessor native catalog','/previous/expectedCatalog/columns');
   removed.push(expected!);
  }
  for(const mapping of addedMappings){
   const expected=next.expectedCatalog.columns.find(c=>c.table===fresh.id&&refKey(c.field)===refKey(mapping.field));
   if(!expected||!addedIds.has(refKey(mapping.field)))fail('New native mapping must correspond to a newly declared Field','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/tables/'+ti+'/columns');
   added.push(expected!);
  }
  const tablePointer=(moduleIndex:number,kind:string,index:number)=>'/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+ti+'/'+kind+'/'+index;
  compareDependencies(oldTable.checks??[],fresh.checks??[],'replace-check',i=>tablePointer(oldModuleIndex,'checks',i),i=>tablePointer(newModuleIndex,'checks',i),tablePointer(newModuleIndex,'checks',0));
  compareDependencies(oldTable.foreignKeys??[],fresh.foreignKeys??[],'replace-foreign-key',i=>tablePointer(oldModuleIndex,'foreignKeys',i),i=>tablePointer(newModuleIndex,'foreignKeys',i),tablePointer(newModuleIndex,'foreignKeys',0));
  compareDependencies(oldTable.indexes??[],fresh.indexes??[],'replace-index',i=>tablePointer(oldModuleIndex,'indexes',i),i=>tablePointer(newModuleIndex,'indexes',i),tablePointer(newModuleIndex,'indexes',0));
  if(!same(without(oldTable.policy,['person','batch']),without(fresh.policy,['person','batch'])))fail('G11 preserves policy mode and unknown policy members',tablePointer(newModuleIndex,'policy',0));
  for(const audience of ['person','batch'])for(const command of ['select','insert','update','delete']){
   if(same(oldTable.policy?.[audience]?.[command],fresh.policy?.[audience]?.[command]))continue;
   const path=tablePointer(newModuleIndex,'policy',0).replace(/\/0$/,'')+'/'+audience+'/'+command,candidate=candidates.find(item=>item.kind==='change-policy'&&item.path===path);
   if(!candidate||!markerIds.has(candidate.id))fail('Changed row policy requires its exact source marker',path);
  }
 }
 if(!removed.length||!added.length)fail('G11 requires at least one stored Field removal and one stored Field addition','/next/source');
 const removedCarrierRefs=new Set(removed.map(column=>refKey(column.field)));
 for(const [index,element] of oldElements.entries())if(element.kind==='field'&&!newById.has(element.id)&&!removedCarrierRefs.has(refKey({module:previous.module,element:element.id})))fail('G11 may remove a Field definition only with its selected stored mapping','/previous/source/modules/'+oldModuleIndex+'/elements/'+index);
 // Validate physical order by stable Field identity. Same SQL names do not
 // identify a retained carrier or confer value-transfer authority.
 const oldTables=previous.expectedCatalog.tables,newTables=next.expectedCatalog.tables;
 if(!same(oldTables.map((t:any)=>t.id),newTables.map((t:any)=>t.id)))fail('G11 preserves exact native table identity and order','/next/expectedCatalog/tables');
 for(const table of oldTables){
  const before=previous.expectedCatalog.columns.filter((c:any)=>c.table===table.id&&!removed.some(r=>r.table===table.id&&refKey(r.field)===refKey(c.field)));
  const after=next.expectedCatalog.columns.filter((c:any)=>c.table===table.id&&!added.some(a=>a.table===table.id&&refKey(a.field)===refKey(c.field)));
  if(!same(before.map((column:any)=>without(column,['sourcePath'])),after.map((column:any)=>without(column,['sourcePath']))))fail('G11 preserves retained native column order and complete expectation','/next/expectedCatalog/tables/'+oldTables.indexOf(table)+'/columns');
 }
 const oldCommands=(oldPayload.commands??[]) as any[],newCommands=(newPayload.commands??[]) as any[];
 const refsFor=(columns:any[],table:string|undefined)=>new Set(columns.filter(column=>column.table===table).map(column=>refKey(column.field)));
 const commandPointer=(moduleIndex:number,index:number)=>'/modules/'+moduleIndex+'/extensions/umf.tables/commands/'+index;
 const commandIds=[...new Set([...oldCommands.map(command=>command.id),...newCommands.map(command=>command.id)])];
 const oldRetainedOrder=oldCommands.filter(command=>newCommands.some(fresh=>fresh.id===command.id)).map(command=>command.id),newRetainedOrder=newCommands.filter(command=>oldCommands.some(old=>old.id===command.id)).map(command=>command.id);
 if(!same(oldRetainedOrder,newRetainedOrder))fail('G11 preserves relative authored order of every retained operation','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/commands');
 const sameProjectedRefs=(before:any[],after:any[],removedFieldRefs:Set<string>,addedFieldRefs:Set<string>):boolean=>same(before.filter(ref=>!removedFieldRefs.has(refKey(ref))),after.filter(ref=>!addedFieldRefs.has(refKey(ref))))&&before.every(ref=>removedFieldRefs.has(refKey(ref))||after.some(item=>refKey(item)===refKey(ref)))&&after.every(ref=>addedFieldRefs.has(refKey(ref))||before.some(item=>refKey(item)===refKey(ref)));
 const sameAssignments=(before:any[],after:any[],removedFieldRefs:Set<string>,addedFieldRefs:Set<string>):boolean=>same(before.filter(item=>!removedFieldRefs.has(refKey(item.field))),after.filter(item=>!addedFieldRefs.has(refKey(item.field))))&&before.every(item=>removedFieldRefs.has(refKey(item.field))||after.some(fresh=>refKey(fresh.field)===refKey(item.field)))&&after.every(item=>addedFieldRefs.has(refKey(item.field))||before.some(old=>refKey(old.field)===refKey(item.field)));
 const operationUses=(value:any,fields:Set<string>):boolean=>Array.isArray(value)?value.some(item=>operationUses(item,fields)):!value||typeof value!=='object'?false:typeof value.module==='string'&&typeof value.element==='string'&&fields.has(refKey(value))||Object.values(value).some(item=>operationUses(item,fields));
 for(const id of commandIds){
  const oldIndex=oldCommands.findIndex(command=>command.id===id),newIndex=newCommands.findIndex(command=>command.id===id),before=oldIndex<0?null:oldCommands[oldIndex],after=newIndex<0?null:newCommands[newIndex];
  if(same(before,after))continue;
  const operationTable=before?.body?.table??after?.body?.table,removedFieldRefs=refsFor(removed,operationTable),addedFieldRefs=refsFor(added,operationTable);
  const hasSelectedReference=operationUses(before,removedFieldRefs)||operationUses(after,addedFieldRefs);
  if(!before||!after){if(!hasSelectedReference)fail('Added or removed operation must explicitly use a selected Field','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/commands');const candidate=candidates.find(item=>item.kind==='change-operation'&&item.oldPath===(oldIndex<0?null:commandPointer(oldModuleIndex,oldIndex))&&item.newPath===(newIndex<0?null:commandPointer(newModuleIndex,newIndex)));if(!candidate||!markerIds.has(candidate.id))fail('Added or removed operation requires its exact source marker','/next/source/modules/'+newModuleIndex+'/extensions/umf.tables/commands');continue;}
  const commandPath=commandPointer(newModuleIndex,newIndex);
  const candidate=candidates.find(item=>item.kind==='change-operation'&&item.oldPath===(oldIndex<0?null:commandPointer(oldModuleIndex,oldIndex))&&item.newPath===(newIndex<0?null:commandPointer(newModuleIndex,newIndex)));
  if(!candidate||!markerIds.has(candidate.id))fail('Changed operation requires its exact source marker',commandPath);
  if(!hasSelectedReference||!['umf.table-operation/0.1','umf.table-operation/0.2'].includes(before.version)||before.version!==after.version||before.id!==after.id||!same(before.consistency,after.consistency)||!same(before.replay,after.replay)||!same(before.batch??null,after.batch??null)||before.body?.kind!==after.body?.kind||before.body?.table!==after.body?.table)fail('Changed operation must preserve identity, effect, table, consistency and replay meaning',commandPath);
  if(!same(without(before,['parameters','body']),without(after,['parameters','body'])))fail('Changed operation must preserve all unselected root source content',commandPath);
  const oldParameters=before.parameters??[],newParameters=after.parameters??[],parameterIds=[...new Set([...oldParameters.map((item:any)=>item.id),...newParameters.map((item:any)=>item.id)])];
  if(!same(oldParameters.filter((item:any)=>!removedFieldRefs.has(refKey(item.field))),newParameters.filter((item:any)=>!addedFieldRefs.has(refKey(item.field)))))fail('Retained operation parameters preserve authored order and complete meaning',commandPath+'/parameters');
  for(const parameterId of parameterIds){const oldParameter=oldParameters.find((item:any)=>item.id===parameterId),newParameter=newParameters.find((item:any)=>item.id===parameterId);
   if(!oldParameter){if(!newParameter||!addedFieldRefs.has(refKey(newParameter.field)))fail('New operation parameters must bind selected added Fields',commandPath+'/parameters');continue;}
   if(!newParameter){if(!removedFieldRefs.has(refKey(oldParameter.field)))fail('Removed operation parameters must bind only selected removed Fields',commandPointer(oldModuleIndex,oldIndex)+'/parameters');continue;}
   if(!same(without(oldParameter,['field']),without(newParameter,['field']))||refKey(oldParameter.field)!==refKey(newParameter.field)&&(!removedFieldRefs.has(refKey(oldParameter.field))||!addedFieldRefs.has(refKey(newParameter.field))))fail('Retained operation parameters may only replace a selected Field binding',commandPath+'/parameters');
  }
  const oldBody=before.body,newBody=after.body;
  if(oldBody.kind==='read'){
   if(!same(without(oldBody,['fields']),without(newBody,['fields']))||!sameProjectedRefs(oldBody.fields,newBody.fields,removedFieldRefs,addedFieldRefs))fail('Read operation changes may only replace selected projected Fields',commandPath+'/body');
  }else if(['insert','insertFrom','update','upsert'].includes(oldBody.kind)){
   if(!same(without(oldBody,['values','returning']),without(newBody,['values','returning']))||!sameAssignments(oldBody.values,newBody.values,removedFieldRefs,addedFieldRefs)||!sameProjectedRefs(oldBody.returning,newBody.returning,removedFieldRefs,addedFieldRefs))fail('Write operation changes may only replace selected assignment/projection Fields',commandPath+'/body');
  }else if(!same(oldBody,newBody))fail('This operation body has no qualified Field-replacement edit form',commandPath+'/body');
 }
 for(const column of removed){
  const candidate=candidates.find(item=>item.kind==='drop-column'&&item.path===column.sourcePath);
  if(!candidate||!markerIds.has(candidate.id))fail('Every purged Field requires its exact drop-column review marker',column.sourcePath);
 }
 // Every generated candidate must be explicitly selected; extra/unused review
 // records are rejected by marker validation before this function is called.
 if(candidates.some(item=>!markerIds.has(item.id)))fail('Every discovered operation/context or dependent change marker must be explicitly consumed','/options/reviewedChanges');
 if(markers.some(item=>item.conversion!==undefined))fail('G11 markers do not admit conversion metadata','/options/reviewedChanges');
 // Ensure field identity deltas describe the same carriers as the catalog.
 if(added.some(item=>!addedIds.has(refKey(item.field))))fail('New native mappings require newly declared Field identities','/next/source');
 return {removed,added};
}
