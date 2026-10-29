import type {TableDeploymentBundle} from '../table-deployment';
import type {TableRef} from '../extensions/tables/types';
import {canonical} from '../compilation/bundle/hash';
import type {G10Options} from './inventory-options';
import {createdOperationReferenceCertificate} from './inventory-operation-references';
import type {TableOperation} from '../extensions/tables/types';
import type {TableInventoryMigrationMarker} from './inventory-options';

type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
const clone=<T>(value:T):T=>structuredClone(value);
const same=(left:unknown,right:unknown):boolean=>canonical(left)===canonical(right);
const refKey=(ref:TableRef):string=>JSON.stringify([ref.module,ref.element]);
type Backfill={table:string;column:TableRef;operation:string;scopedRows:true};
function refuse(code:string):never{throw new Error('G10_G02_SOURCE_'+code);}
function jsonSource(bundle:TableDeploymentBundle):any{
 if(bundle.source.format!=='json')refuse('FORMAT');
 try{return JSON.parse(bundle.source.utf8);}catch{return refuse('PARSE');}
}
function tablePayload(doc:any,moduleId:string):any{
 const module=doc.modules?.find((candidate:any)=>candidate.id===moduleId),payload=module?.extensions?.['umf.tables'];
 if(!payload||!Array.isArray(payload.tables)||!Array.isArray(payload.commands)||!Array.isArray(payload.seedSets))refuse('TABLES_BINDING');
 return payload;
}
function ref(value:any):value is {module:string;element:string}{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&typeof value.module==='string'&&typeof value.element==='string';}
function createdCommandOnly(command:any,payload:any,created:Set<string>,source:any):boolean{
 // `next` was independently compiled as a complete deployment source before
 // this correspondence check. Do not duplicate the operation grammar here:
 // optional compiler-admitted members such as batch limits remain part of the
 // exact certificate meaning and are preserved by the complete source.
 if(!command||typeof command!=='object'||Array.isArray(command)||typeof command.id!=='string'||!command.id)return false;
 // Opaque query text has no source-derived finite read set. It remains outside
 // this G02 create-only composition until a separately reviewed query meaning exists.
 const tables=payload.tables as any[];
 try{return createdOperationReferenceCertificate(command as TableOperation,tables,created,source)!==null;}catch{return false;}
}

/**
 * Partition the globally reviewed G10 marker sequence before entering the
 * legacy G02 .4 constructor. Every global marker must have one source-derived
 * owner; only the selected G02 field's own tightening marker is passed to the
 * unchanged .4 validator. Create-table, selected/new operation and global
 * operation-context markers remain claimed by their respective G10 groups.
 */
export function partitionInventoryMarkersForG02(markers:readonly TableInventoryMigrationMarker[],previous:TableDeploymentBundle,next:TableDeploymentBundle,createdTables:readonly string[],backfill:Backfill):TableInventoryMigrationMarker[]{
 const oldDoc=jsonSource(previous),newDoc=jsonSource(next),oldPayload=tablePayload(oldDoc,previous.module),newPayload=tablePayload(newDoc,next.module);
 if(previous.module!==next.module||previous.configuration.schema!==next.configuration.schema)refuse('PARTITION_SOURCE_PAIR');
 const created=new Set(createdTables);if(created.size!==createdTables.length||created.has(backfill.table))refuse('PARTITION_CREATE_SET');
 const g02Column=next.expectedCatalog.columns.filter(column=>column.table===backfill.table&&refKey(column.field)===refKey(backfill.column));
 const oldColumn=previous.expectedCatalog.columns.filter(column=>column.table===backfill.table&&refKey(column.field)===refKey(backfill.column));
 if(g02Column.length!==1||oldColumn.length>1)refuse('PARTITION_G02_COLUMN');
 const selectedCommandMatches=(newPayload.commands as any[]).filter(command=>command?.id===backfill.operation);
 if(selectedCommandMatches.length!==1||(oldPayload.commands as any[]).some(command=>command?.id===backfill.operation))refuse('PARTITION_G02_OPERATION');
 const tablePath=(tableId:string):string|null=>{
  const tables=newDoc.modules?.find((module:any)=>module.id===next.module)?.extensions?.['umf.tables']?.tables as any[]|undefined;
  const index=tables?.findIndex(table=>table?.id===tableId)??-1;
  return index<0?null:`/modules/${newDoc.modules.findIndex((module:any)=>module.id===next.module)}/extensions/umf.tables/tables/${index}`;
 };
 const commandAt=(doc:any,moduleIndex:number,commandIndex:number):{moduleId:string;payload:any;command:any}|null=>{
  const module=doc.modules?.[moduleIndex],payload=module?.extensions?.['umf.tables'],command=payload?.commands?.[commandIndex];
  return typeof module?.id==='string'&&payload&&command?{moduleId:module.id,payload,command}:null;
 };
 const commandForIdentity=(doc:any,moduleId:string,commandId:string):any[]=>{
  const module=doc.modules?.find((item:any)=>item?.id===moduleId),commands=module?.extensions?.['umf.tables']?.commands;
  return Array.isArray(commands)?commands.filter((item:any)=>item?.id===commandId):[];
 };
 const claims=new Map<string,string>(),local:TableInventoryMigrationMarker[]=[];
 const claim=(marker:TableInventoryMigrationMarker,owner:string):void=>{if(claims.has(marker.id))refuse('PARTITION_MARKER_DUPLICATE_OWNER');claims.set(marker.id,owner);};
 const expectedCreatePaths=new Map([...created].map(id=>[tablePath(id),id]));
 if(expectedCreatePaths.has(null)||expectedCreatePaths.size!==created.size)refuse('PARTITION_CREATE_PATH');
 const targetPath=g02Column[0]!.sourcePath;
 for(const marker of markers){
  if(marker.kind==='create-table'){
   const tableId=expectedCreatePaths.get(marker.path);if(!tableId)refuse('PARTITION_UNOWNED_CREATE_MARKER');claim(marker,`create-table:${tableId}`);continue;
  }
  if(marker.kind==='tighten-not-null'&&marker.path===targetPath){
   if(oldColumn.length!==1)refuse('PARTITION_APPENDED_TIGHTENING_MARKER');claim(marker,`g02-field:${backfill.table}:${refKey(backfill.column)}`);local.push(marker);continue;
  }
  if(marker.kind==='replace-check'&&marker.path===targetPath+'/domain'){
   claim(marker,`g02-target-domain-check:${backfill.table}:${refKey(backfill.column)}`);continue;
  }
  if(marker.kind==='change-operation'||marker.kind==='change-operation-context'){
   const match=/^\/modules\/(\d+)\/extensions\/umf\.tables\/commands\/(\d+)$/.exec(marker.path);if(!match)refuse('PARTITION_OPERATION_PATH');
   const moduleIndex=Number(match[1]),operationIndex=Number(match[2]),located=commandAt(newDoc,moduleIndex,operationIndex);if(!located||typeof located.command.id!=='string')refuse('PARTITION_OPERATION_SOURCE');
   const {moduleId,payload:freshPayload,command:fresh}=located;
   if(moduleId===next.module&&fresh.id===backfill.operation){if(marker.kind!=='change-operation'||canonical(fresh)!==canonical(selectedCommandMatches[0]))refuse('PARTITION_G02_OPERATION_MARKER');claim(marker,`g02-operation:${fresh.id}`);continue;}
   const oldMatches=commandForIdentity(oldDoc,moduleId,fresh.id);
   if(marker.kind==='change-operation-context'){
    if(oldMatches.length!==1||canonical(oldMatches[0])!==canonical(fresh))refuse('PARTITION_CONTEXT_MARKER');claim(marker,`source-context:${fresh.id}`);continue;
   }
   if(oldMatches.length!==0||!createdCommandOnly(fresh,freshPayload,created,newDoc))refuse('PARTITION_UNOWNED_OPERATION_MARKER');
   claim(marker,`created-operation:${fresh.id}`);continue;
  }
  refuse('PARTITION_UNOWNED_MARKER');
 }
 if([...created].some(id=>![...claims.values()].includes(`create-table:${id}`)))refuse('PARTITION_CREATE_MARKER_MISSING');
 if(oldColumn.length===1&&local.length!==1)refuse('PARTITION_G02_TIGHTENING_MISSING');
 if(oldColumn.length===0&&local.length!==0)refuse('PARTITION_G02_TIGHTENING_UNEXPECTED');
 if(claims.size!==markers.length)refuse('PARTITION_MARKER_UNCLAIMED');
 return local;
}

/** Compare complete source documents after removing only selected G02/create source nodes. */
export function sameSourceExceptG02AndCreates(previous:TableDeploymentBundle,next:TableDeploymentBundle,options:G10Options,createdTables:readonly string[]):boolean{
 if(options.backfills.length!==1)return false;
 const fill=options.backfills[0]!,oldDoc=jsonSource(previous),newDoc=jsonSource(next),oldPayload=tablePayload(oldDoc,previous.module),newPayload=tablePayload(newDoc,next.module);
 if(previous.module!==next.module||previous.configuration.schema!==next.configuration.schema||!Array.isArray(oldDoc.modules)||!Array.isArray(newDoc.modules))return false;
 const oldTable=oldPayload.tables.find((item:any)=>item.id===fill.table),newTable=newPayload.tables.find((item:any)=>item.id===fill.table);
 if(!oldTable||!newTable||!same(oldTable.record,newTable.record))return false;
 const oldRecordModule=oldDoc.modules.find((module:any)=>module.id===oldTable.record.module),newRecordModule=newDoc.modules.find((module:any)=>module.id===newTable.record.module),oldRecord=oldRecordModule?.elements?.find((item:any)=>item.kind==='record'&&item.id===oldTable.record.element),newRecord=newRecordModule?.elements?.find((item:any)=>item.kind==='record'&&item.id===newTable.record.element);
 if(!oldRecord||!newRecord||!Array.isArray(oldRecord.members)||!Array.isArray(newRecord.members))return false;
 const selectedRef=refKey(fill.column),oldMapping=oldTable.columns?.find((item:any)=>item.field&&refKey(item.field)===selectedRef),newMapping=newTable.columns?.find((item:any)=>item.field&&refKey(item.field)===selectedRef);
 if(!newMapping)return false;
 const oldElementModule=oldDoc.modules.find((module:any)=>module.id===fill.column.module),newElementModule=newDoc.modules.find((module:any)=>module.id===fill.column.module),oldField=oldElementModule?.elements?.find((item:any)=>item.kind==='field'&&item.id===fill.column.element),newField=newElementModule?.elements?.find((item:any)=>item.kind==='field'&&item.id===fill.column.element);
 if(!newField)return false;
 const appended=oldMapping===undefined;
 if(appended){
  if(oldField||!newRecord.members.some((member:any)=>member?.module===fill.column.module&&member.element===fill.column.element))return false;
 }else{
  if(!oldField||!oldRecord.members.some((member:any)=>refKey(member)===selectedRef)||!newRecord.members.some((member:any)=>refKey(member)===selectedRef))return false;
  if(!Object.hasOwn(oldField,'nullability')||!Object.hasOwn(newField,'nullability'))return false;
  newField.nullability=oldField.nullability;
 }
 const oldCommand=oldPayload.commands.find((item:any)=>item?.id===fill.operation),newCommands=newPayload.commands.filter((item:any)=>item?.id===fill.operation);
 if(oldCommand||newCommands.length!==1)return false;
 newPayload.commands=newPayload.commands.filter((item:any)=>item?.id!==fill.operation);
 const created=new Set(createdTables);
 if(created.size!==createdTables.length||created.has(fill.table))return false;
 const createdDeclarations:any[]=[];
 for(const tableId of created){
  if(oldPayload.tables.some((item:any)=>item?.id===tableId))return false;
  const matches=newPayload.tables.filter((item:any)=>item?.id===tableId);if(matches.length!==1)return false;createdDeclarations.push(matches[0]);
 }
 // Only newly authored commands whose complete typed read/write closure is
 // confined to selected created carriers can be isolated from the retained
 // source comparison. Existing command IDs and retained-source operations
 // remain part of the exact comparison.
 const oldCommandIds=new Set(oldPayload.commands.map((command:any)=>command?.id).filter((id:any)=>typeof id==='string'));
 const newlyAuthoredCommands=newPayload.commands.filter((command:any)=>!oldCommandIds.has(command?.id));
 const newCommandIds=new Set<string>();
 for(const command of newlyAuthoredCommands){if(!createdCommandOnly(command,newPayload,created,newDoc)||newCommandIds.has(command.id))return false;newCommandIds.add(command.id);}
 newPayload.commands=newPayload.commands.filter((command:any)=>!newCommandIds.has(command?.id));
 // Newly authored seed definitions may be selected for apply-once execution
 // or remain not-run. Their complete rows must still be closed over selected
 // created carriers; the exact source bundle retains every definition.
 const oldSeedIds=new Set(oldPayload.seedSets.map((seed:any)=>seed?.id).filter((id:any)=>typeof id==='string'));
 const newSeedIds=new Set<string>();for(const seed of newPayload.seedSets){if(typeof seed?.id!=='string'||!seed.id||newSeedIds.has(seed.id))return false;newSeedIds.add(seed.id);}
 const selectedSeedIds=new Set(options.seedSets);
 const newlyAuthoredSeedSets=newPayload.seedSets.filter((seed:any)=>!oldSeedIds.has(seed?.id));
 for(const id of selectedSeedIds){if(!newSeedIds.has(id))return false;}
 for(const seed of newlyAuthoredSeedSets){if(!Array.isArray(seed.rows)||seed.rows.length===0||seed.rows.some((row:any)=>!row||typeof row.table!=='string'||!created.has(row.table)))return false;}
 newPayload.seedSets=newPayload.seedSets.filter((seed:any)=>oldSeedIds.has(seed?.id));
 const processedRecords=new Set<string>(),createdFieldRefs=new Map<string,{module:string;element:string}>();for(const declaration of createdDeclarations){
  const ref=declaration.record;if(!ref||typeof ref.module!=='string'||typeof ref.element!=='string')return false;
  const recordKey=refKey(ref);if(processedRecords.has(recordKey))continue;processedRecords.add(recordKey);
  const oldModule=oldDoc.modules.find((module:any)=>module.id===ref.module),newModule=newDoc.modules.find((module:any)=>module.id===ref.module),oldRecord=oldModule?.elements?.find((item:any)=>item.kind==='record'&&item.id===ref.element);
  if(oldRecord)continue;
  const record=newModule?.elements?.find((item:any)=>item.kind==='record'&&item.id===ref.element);if(!record||!Array.isArray(record.members))return false;
  const consumers=newPayload.tables.filter((table:any)=>table.record?.module===ref.module&&table.record?.element===ref.element);
  if(!consumers.length||consumers.some((table:any)=>!created.has(table.id)))return false;
  if(record.members.some((member:any)=>!consumers.some((table:any)=>table.columns?.some((column:any)=>column.field?.module===member?.module&&column.field?.element===member?.element))))return false;
  newModule.elements=newModule.elements.filter((item:any)=>!(item.kind==='record'&&item.id===ref.element));
  for(const member of record.members){
   if(!member||typeof member.module!=='string'||typeof member.element!=='string')return false;
   if(member.module===fill.column.module&&member.element===fill.column.element)return false;
   const existingModule=oldDoc.modules.find((module:any)=>module.id===member.module),existingField=existingModule?.elements?.find((item:any)=>item.kind==='field'&&item.id===member.element);
   if(existingField)continue;
   const memberModule=newDoc.modules.find((module:any)=>module.id===member.module);if(!memberModule?.elements?.some((item:any)=>item.kind==='field'&&item.id===member.element))return false;
   createdFieldRefs.set(refKey(member),{module:member.module,element:member.element});
  }
 }
 newPayload.tables=newPayload.tables.filter((item:any)=>!created.has(item?.id));
 for(const member of createdFieldRefs.values()){
  const stillMapped=newPayload.tables.some((table:any)=>table.columns?.some((column:any)=>column.field?.module===member.module&&column.field?.element===member.element));
  const stillMember=newDoc.modules.some((module:any)=>module.elements?.some((element:any)=>element.kind==='record'&&element.members?.some((ref:any)=>ref?.module===member.module&&ref?.element===member.element)));
  if(stillMapped||stillMember)return false;
  const fieldModule=newDoc.modules.find((module:any)=>module.id===member.module);if(!fieldModule)return false;
  fieldModule.elements=fieldModule.elements.filter((item:any)=>!(item.kind==='field'&&item.id===member.element));
 }
 if(appended){
  // Reapply the original G02 append-only contract after removing only the
  // independently selected CREATE closure. Stable IDs authorize table-order
  // shifts; they do not authorize inserting a physical column into the middle.
  const fieldIndex=newElementModule.elements.findIndex((item:any)=>item.kind==='field'&&item.id===fill.column.element);
  const memberIndex=newRecord.members.findIndex((member:any)=>refKey(member)===selectedRef);
  const mappingIndex=newTable.columns.findIndex((item:any)=>item.field&&refKey(item.field)===selectedRef);
  const oldFieldCount=oldElementModule?.elements?.length;
  if(typeof oldFieldCount!=='number'||fieldIndex<oldFieldCount||memberIndex<oldRecord.members.length||mappingIndex!==newTable.columns.length-1)return false;
  newTable.columns.splice(mappingIndex,1);
  newRecord.members.splice(memberIndex,1);
  newElementModule.elements.splice(fieldIndex,1);
 }
 const oldCanonical={document:oldDoc,configuration:clone(previous.configuration)} as unknown as Json,newCanonical={document:newDoc,configuration:clone(next.configuration)} as unknown as Json;
 return same(oldCanonical,newCanonical);
}
