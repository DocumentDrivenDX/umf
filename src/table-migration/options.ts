// SPDX-License-Identifier: MIT OR Apache-2.0
import {readDocument} from '../model/document';
import {UmfError} from '../model/types';
import type {TableDeploymentBundle} from '../table-deployment';
import type {TableOperation,TableRef} from '../extensions/tables';
import {validateReviewedChangeMarkers,type ReviewedChangeMarker} from './reviewed';
export type {ReviewedChangeMarker,ReviewedChangeKind,ReviewedChangeCandidate} from './reviewed';
export interface TableMigrationOptions {
 version:'umf.table-migration-options/0.1'|'umf.table-migration-options/0.2';
 backfills:{table:string;column:TableRef;operation:string;scopedRows:true}[];
 concurrentIndexes:{table:string;index:string}[];
 reviewedChanges?:ReviewedChangeMarker[];
 validations?:{table:string;constraint:string;kind:'check'|'foreignKey'}[];
}
export interface MigrationReview {code:'SCOPED_BACKFILL'|'POLICY_CHANGE_REVIEW';path:string;message:string}
const fail=(message:string,path='/options'):never=>{throw new UmfError('TABLE_MIGRATION_OPTIONS',message,path);};
const exact=(value:unknown,keys:string[]):boolean=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export const refKey=(ref:TableRef):string=>JSON.stringify([ref.module,ref.element]);
export function migrationOptions(value:TableMigrationOptions|undefined,next:TableDeploymentBundle,previous:TableDeploymentBundle|null):TableMigrationOptions|undefined{
 if(value===undefined)return;
 const v1=value.version==='umf.table-migration-options/0.1',v2=value.version==='umf.table-migration-options/0.2';
 if((v1&&!exact(value,['version','backfills','concurrentIndexes']))||(v2&&!exact(value,['version','backfills','concurrentIndexes','reviewedChanges','validations']))||(!v1&&!v2)||!Array.isArray(value.backfills)||!Array.isArray(value.concurrentIndexes)||value.backfills.length>256||value.concurrentIndexes.length>256||(v2&&(!Array.isArray(value.reviewedChanges)||!Array.isArray(value.validations)||value.validations.length>256)))fail('Unknown options profile, members or resource bounds');
 if(!previous)return fail('Options require a previous installed source');
 if(v2){
  try{value.reviewedChanges=validateReviewedChangeMarkers(value.reviewedChanges,previous,next);}catch(error){fail(error instanceof Error?error.message:'Invalid reviewed change marker');}
  const seenValidations=new Set<string>();
  for(const [i,selection] of value.validations!.entries()){
   const path='/options/validations/'+i;
   if(!exact(selection,['table','constraint','kind'])||!['check','foreignKey'].includes(selection.kind)||typeof selection.table!=='string'||typeof selection.constraint!=='string')fail('Validation selection requires table, constraint and supported kind',path);
   const id=JSON.stringify([selection.table,selection.constraint,selection.kind]);if(seenValidations.has(id))fail('Duplicate validation selection',path);seenValidations.add(id);
   const oldTable=previous.expectedCatalog.tables.find(t=>t.id===selection.table),newTable=next.expectedCatalog.tables.find(t=>t.id===selection.table);
   const oldItems=selection.kind==='check'?oldTable?.checks:oldTable?.foreignKeys,newItems=selection.kind==='check'?newTable?.checks:newTable?.foreignKeys;
   if(!newTable||!newItems?.some(item=>item.id===selection.constraint)||oldItems?.some(item=>item.id===selection.constraint))fail('Validation must select a newly added constraint on an existing table',path);
  }
 }
 const document=readDocument(next.source.utf8,next.source.format),module=document.modules.find(m=>m.id===next.module)!;
 const commands=(module.extensions!['umf.tables'] as unknown as {commands:TableOperation[]}).commands;
 const seen=new Set<string>();
 for(const [i,backfill] of value.backfills.entries()){
  const path='/options/backfills/'+i;
  if(!exact(backfill,['table','column','operation','scopedRows'])||!exact(backfill.column,['module','element'])||backfill.scopedRows!==true)fail('Backfill requires explicit scoped-row acknowledgement',path);
  const table=next.expectedCatalog.tables.find(t=>t.id===backfill.table),old=previous.expectedCatalog.tables.find(t=>t.id===backfill.table);
  const column=table?.columns.find(c=>refKey(c.field)===refKey(backfill.column));
  if(!table||!old||!column||old.columns.some(c=>refKey(c.field)===refKey(backfill.column)))fail('Backfill must select an appended column on an existing table',path);
  const identity=JSON.stringify([backfill.table,refKey(backfill.column)]);
  if(seen.has(identity))fail('Duplicate backfill',path);seen.add(identity);
  const command=commands.find(c=>c.id===backfill.operation),body=command?.body;
  if(!command||command.parameters.length||command.batch||body?.kind!=='update'||body.table!==table!.id||body.returning.length||body.values.length!==1||refKey(body.values[0]!.field)!==refKey(backfill.column)||!['literal','currentTimestamp'].includes(body.values[0]!.value.kind)||body.where.op!=='isNull'||refKey(body.where.field)!==refKey(backfill.column))fail('Backfill requires an original parameter-free bounded UPDATE of only its selected NULL column',path);
 }
 seen.clear();
 for(const [i,selection] of value.concurrentIndexes.entries()){
  const path='/options/concurrentIndexes/'+i;
  if(!exact(selection,['table','index']))fail('Unknown concurrent index selection',path);
  const table=next.expectedCatalog.tables.find(t=>t.id===selection.table),old=previous.expectedCatalog.tables.find(t=>t.id===selection.table);
  if(!table||!old||!table.indexes.some(index=>index.id===selection.index)||old.indexes.some(index=>index.id===selection.index))fail('Concurrent index must be newly appended on an existing table',path);
  const identity=JSON.stringify([selection.table,selection.index]);if(seen.has(identity))fail('Duplicate concurrent index selection',path);seen.add(identity);
 }
 return value;
}
