// SPDX-License-Identifier: MIT OR Apache-2.0
import {readDocument} from '../model/document';
import {UmfError} from '../model/types';
import {canonical} from '../compilation/bundle/hash';
import type {TableDeploymentBundle} from '../table-deployment';
import type {RowExpressionOperation,TableOperation,TableRef} from '../extensions/tables';
import {rowExpressionInputRefs} from '../extensions/tables/row-expressions';
import {validateReviewedChangeMarkers,type ReviewedChangeMarker} from './reviewed';
import {validateG03DefaultChange} from './g03-defaults';
export type {ReviewedChangeMarker,ReviewedChangeKind,ReviewedChangeCandidate} from './reviewed';
export interface TableMigrationOptions {
 version:'umf.table-migration-options/0.1'|'umf.table-migration-options/0.2'|'umf.table-migration-options/0.3'|'umf.table-migration-options/0.4'|'umf.table-migration-options/0.5';
 backfills:{table:string;column:TableRef;operation:string;scopedRows:true}[];
 concurrentIndexes:{table:string;index:string}[];
 reviewedChanges?:ReviewedChangeMarker[];
 validations?:{table:string;constraint:string;kind:'check'|'foreignKey'}[];
}
export interface MigrationReview {code:'SCOPED_BACKFILL'|'POLICY_CHANGE_REVIEW'|'IRREVERSIBLE_COLUMN_PURGE';path:string;message:string}
const fail=(message:string,path='/options'):never=>{throw new UmfError('TABLE_MIGRATION_OPTIONS',message,path);};
const exact=(value:unknown,keys:string[]):boolean=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const same=(a:unknown,b:unknown):boolean=>canonical(a)===canonical(b);
function validateExistingFill(previous:TableDeploymentBundle,next:TableDeploymentBundle,tableId:string,columnRef:TableRef,path:string):string{
 const oldTable=previous.expectedCatalog.tables.find(item=>item.id===tableId),newTable=next.expectedCatalog.tables.find(item=>item.id===tableId);
 const oldColumn=previous.expectedCatalog.columns.find(item=>item.table===tableId&&refKey(item.field)===refKey(columnRef));
 const newColumn=next.expectedCatalog.columns.find(item=>item.table===tableId&&refKey(item.field)===refKey(columnRef));
 if(!oldTable||!newTable||!oldColumn||!newColumn||!oldColumn.nullable||newColumn.nullable)fail('Existing-field fill requires the same installed table and Field changing only from optional to required',path);
 const oldMapping=oldTable!.columns.find(item=>refKey(item.field)===refKey(columnRef)),newMapping=newTable!.columns.find(item=>refKey(item.field)===refKey(columnRef));
 if(!oldMapping||!newMapping||!same(oldMapping,newMapping)||oldMapping.generated||oldMapping.immutable===true||newMapping.generated||newMapping.immutable===true||oldColumn!.name!==newColumn!.name||oldColumn!.typeSchema!==newColumn!.typeSchema||oldColumn!.typeName!==newColumn!.typeName||oldColumn!.typeMod!==newColumn!.typeMod||oldColumn!.collation!==newColumn!.collation||oldColumn!.identity!==''||newColumn!.identity!==''||!same({...oldColumn!,nullable:null,definitionSql:null,sourcePath:null},{...newColumn!,nullable:null,definitionSql:null,sourcePath:null}))fail('Existing-field fill cannot change native name, type, default, generation, immutability or other column meaning',path);
 const before=readDocument(previous.source.utf8,previous.source.format).modules.find(module=>module.id===columnRef.module)?.elements.find(element=>element.id===columnRef.element);
 const after=readDocument(next.source.utf8,next.source.format).modules.find(module=>module.id===columnRef.module)?.elements.find(element=>element.id===columnRef.element);
 if(!before||!after||before.kind!=='field'||after.kind!=='field'||before.nullability!=='absent-allowed'||after.nullability!=='required'||!same({...before,nullability:null},{...after,nullability:null}))fail('Existing-field fill requires unchanged logical meaning except optional-to-required nullability',path);
 const markerPath=newColumn!.sourcePath;
 if(!next.source.utf8||!markerPath)fail('Existing-field tightening needs its exact source path',path);
 return markerPath;
}
export const refKey=(ref:TableRef):string=>JSON.stringify([ref.module,ref.element]);
export function migrationOptions(value:TableMigrationOptions|undefined,next:TableDeploymentBundle,previous:TableDeploymentBundle|null):TableMigrationOptions|undefined{
 if(value===undefined)return;
 const v1=value.version==='umf.table-migration-options/0.1',v2=value.version==='umf.table-migration-options/0.2';
 const v3=value.version==='umf.table-migration-options/0.3';
 const v4=value.version==='umf.table-migration-options/0.4';
 const v5=value.version==='umf.table-migration-options/0.5';
 if((v1&&!exact(value,['version','backfills','concurrentIndexes']))||((v2||v3||v4||v5)&&!exact(value,['version','backfills','concurrentIndexes','reviewedChanges','validations']))||(!v1&&!v2&&!v3&&!v4&&!v5)||!Array.isArray(value.backfills)||!Array.isArray(value.concurrentIndexes)||value.backfills.length>256||value.concurrentIndexes.length>256||((v2||v3||v4||v5)&&(!Array.isArray(value.reviewedChanges)||!Array.isArray(value.validations)||value.validations.length>256)))fail('Unknown options profile, members or resource bounds');
 if(!previous)return fail(v2?'Version 0.2 phased plans require a previous installed source; initial publication is not supported':v5?'Version 0.5 default changes require a previous installed source; initial publication is not supported':'Options require a previous installed source');
 if(v4&&previous.source.format!=='json')fail('Version 0.4 derived backfills require JSON source bytes','/previous/source/format');
 if(v4&&next.source.format!=='json')fail('Version 0.4 derived backfills require JSON source bytes','/next/source/format');
 if(v5&&previous.source.format!=='json')fail('Version 0.5 default changes require JSON source bytes','/previous/source/format');
 if(v5&&next.source.format!=='json')fail('Version 0.5 default changes require JSON source bytes','/next/source/format');
 if(v2||v3||v4||v5){
  try{value.reviewedChanges=validateReviewedChangeMarkers(value.reviewedChanges,previous,next,v5?{version:'umf.table-migration-discovery/0.2'}:undefined);}catch(error){fail(error instanceof Error?error.message:'Invalid reviewed change marker');}
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
 const commands=(module.extensions!['umf.tables'] as unknown as {commands:(TableOperation|RowExpressionOperation)[]}).commands;
 const seen=new Set<string>();
 for(const [i,backfill] of value.backfills.entries()){
  const path='/options/backfills/'+i;
  if(!exact(backfill,['table','column','operation','scopedRows'])||!exact(backfill.column,['module','element'])||backfill.scopedRows!==true)fail('Backfill requires explicit scoped-row acknowledgement',path);
  const table=next.expectedCatalog.tables.find(t=>t.id===backfill.table),old=previous.expectedCatalog.tables.find(t=>t.id===backfill.table);
  const column=table?.columns.find(c=>refKey(c.field)===refKey(backfill.column));
  if(!table||!old||!column)fail('Backfill must select a column on an existing table',path);
  const existing=old!.columns.some(c=>refKey(c.field)===refKey(backfill.column));
  if(existing){
   if(!v3&&!v4)fail('Historical backfill on an existing column requires options version 0.3 or later',path);
   if(v4){
    const operation=commands.find(c=>c.id===backfill.operation) as any,body=operation?.body as any;
    if(!operation||operation.version!=='umf.table-operation/0.2'||operation.parameters.length||operation.batch||body?.kind!=='update'||body.table!==table!.id||body.returning.length||body.values.length!==1||refKey(body.values[0]!.field)!==refKey(backfill.column)||body.values[0]!.value.kind!=='rowExpression'||body.where.op!=='isNull'||refKey(body.where.field)!==refKey(backfill.column)||!Number.isInteger(body.maxRows)||body.maxRows<1||body.maxRows>10000)fail('Derived backfill requires one bounded parameter-free operation 0.2 UPDATE of only its selected NULL column',path);
    validateExpressionInputs(body.values[0]!.value.expression,previous,next,backfill.table,backfill.column,path);
    const markerPath=next.expectedCatalog.columns.find(c=>c.table===backfill.table&&refKey(c.field)===refKey(backfill.column))!.sourcePath;
    if(!value.reviewedChanges!.some(marker=>marker.kind==='tighten-not-null'&&marker.path===markerPath))fail('Existing-field derived fill requires its exact reviewed NOT NULL marker',path);
   }
   if(!v4){
   const markerPath=validateExistingFill(previous,next,backfill.table,backfill.column,path);
   if(!value.reviewedChanges!.some(marker=>marker.kind==='tighten-not-null'&&marker.path===markerPath))fail('Existing-field fill requires its exact reviewed NOT NULL marker',path);
   }
  }
  const identity=JSON.stringify([backfill.table,refKey(backfill.column)]);
  if(seen.has(identity))fail('Duplicate backfill',path);seen.add(identity);
  const command=commands.find(c=>c.id===backfill.operation) as any,body=command?.body as any;
  if(!v4&&(!command||command.parameters.length||command.batch||body?.kind!=='update'||body.table!==table!.id||body.returning.length||body.values.length!==1||refKey(body.values[0]!.field)!==refKey(backfill.column)||!['literal','currentTimestamp'].includes(body.values[0]!.value.kind)||body.where.op!=='isNull'||refKey(body.where.field)!==refKey(backfill.column)||(v3&&(!Number.isInteger(body.maxRows)||body.maxRows<1||body.maxRows>10000||(body.values[0]!.value.kind==='literal'&&body.values[0]!.value.value===null)||(body.values[0]!.value.kind==='currentTimestamp'&&column!.nativeType.kind!=='timestamptz')))))fail('Backfill requires an original parameter-free bounded UPDATE of only its selected NULL column with a compatible value domain',path);
  if(v4&&!existing){
   const operation=commands.find(c=>c.id===backfill.operation) as any,body=operation?.body as any;
   if(!operation||operation.version!=='umf.table-operation/0.2'||operation.parameters.length||operation.batch||body?.kind!=='update'||body.table!==table!.id||body.returning.length||body.values.length!==1||refKey(body.values[0]!.field)!==refKey(backfill.column)||body.values[0]!.value.kind!=='rowExpression'||body.where.op!=='isNull'||refKey(body.where.field)!==refKey(backfill.column)||!Number.isInteger(body.maxRows)||body.maxRows<1||body.maxRows>10000)fail('Appended derived backfill requires one bounded parameter-free operation 0.2 UPDATE of only its selected NULL column',path);
   validateExpressionInputs(body.values[0]!.value.expression,previous,next,backfill.table,backfill.column,path);
   validateAppendTarget(previous,next,backfill.table,backfill.column,path);
  }
 }
 if(v4){
  if(value.backfills.length!==1||value.concurrentIndexes.length||value.validations!.length)fail('G02 selects exactly one derived backfill with no concurrent indexes or deferred validations');
  const selected=value.backfills[0]!,operation=commands.find(c=>c.id===selected.operation) as any;
  const existing=previous.expectedCatalog.columns.some(c=>c.table===selected.table&&refKey(c.field)===refKey(selected.column));
  if(existing){
   const markerPath=validateExistingFill(previous,next,selected.table,selected.column,'/options/backfills/0');
   if(value.reviewedChanges!.length!==1||value.reviewedChanges![0]!.kind!=='tighten-not-null'||value.reviewedChanges![0]!.path!==markerPath)fail('Existing G02 fill requires only its exact reviewed NOT NULL marker','/options/reviewedChanges');
  }else if(value.reviewedChanges!.length!==0)fail('An appended target cannot carry a fabricated review marker','/options/reviewedChanges');
  validateG02SourceDelta(previous,next,selected.table,selected.column,selected.operation,existing);
  if(!operation||operation.version!=='umf.table-operation/0.2')fail('G02 must select its exact next-source operation 0.2','/options/backfills/0/operation');
 }
 if(v5){
  if(value.backfills.length||value.concurrentIndexes.length||value.validations!.length||value.reviewedChanges!.length!==1)fail('G03 selects one existing-column default change only, with no backfills, indexes or validations');
  if(Object.keys(value.reviewedChanges![0]!).sort().join(',')!=='id,kind,newDigest,oldDigest,path')fail('G03 default marker is closed and cannot carry conversion or unknown qualifiers','/options/reviewedChanges/0');
  validateG03DefaultChange(previous,next,value.reviewedChanges);
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

function validateExpressionInputs(expression:unknown,previous:TableDeploymentBundle,next:TableDeploymentBundle,table:string,target:TableRef,path:string):void{
 let refs:TableRef[];
 try{refs=rowExpressionInputRefs(expression as any);}catch{fail('Derived expression contains invalid or unbounded references',path);}
 for(const ref of refs!){
  if(ref.module!==target.module||refKey(ref)===refKey(target))fail('Derived expression inputs must be unchanged existing fields on the selected table',path);
  const before=previous.expectedCatalog.columns.find(c=>c.table===table&&refKey(c.field)===refKey(ref));
  const after=next.expectedCatalog.columns.find(c=>c.table===table&&refKey(c.field)===refKey(ref));
  if(!before||!after||!same(before,after)||!same(previous.expectedCatalog.tables.find(t=>t.id===table)?.columns.find(c=>refKey(c.field)===refKey(ref)),next.expectedCatalog.tables.find(t=>t.id===table)?.columns.find(c=>refKey(c.field)===refKey(ref))))fail('Derived expression inputs must be unchanged existing fields on the selected table',path);
  const oldField=readDocument(previous.source.utf8,previous.source.format).modules.find(m=>m.id===ref.module)?.elements.find(e=>e.id===ref.element);
  const newField=readDocument(next.source.utf8,next.source.format).modules.find(m=>m.id===ref.module)?.elements.find(e=>e.id===ref.element);
  if(!oldField||!newField||!same(oldField,newField))fail('Derived expression inputs must retain exact logical and extension meaning across both sources',path);
 }
}

function validateG02SourceDelta(previous:TableDeploymentBundle,next:TableDeploymentBundle,tableId:string,target:TableRef,operationId:string,existing:boolean):void{
 const oldDocument=readDocument(previous.source.utf8,previous.source.format),newDocument=readDocument(next.source.utf8,next.source.format);
 const oldModule=oldDocument.modules.find(m=>m.id===previous.module),newModule=newDocument.modules.find(m=>m.id===next.module);
 const failPath='/next/source';
 if(!oldModule||!newModule)fail('G02 source module is missing',failPath);
 const oldPayload=oldModule!.extensions?.['umf.tables'] as any;
 const newPayload=newModule!.extensions?.['umf.tables'] as any;
 const oldCommands=oldPayload?.commands??[],newCommands=newPayload?.commands??[];
 if(oldCommands.some((command:any)=>command.id===operationId)||newCommands.filter((command:any)=>command.id===operationId).length!==1)fail('G02 operation must be one newly appended source command',failPath+'/modules/'+next.module+'/extensions/umf.tables/commands');
 if(newPayload?.commands)newPayload.commands=newPayload.commands.filter((command:any)=>command.id!==operationId);
 if(existing){
  const before=oldModule!.elements.find(e=>e.kind==='field'&&e.id===target.element);
  const after=newModule!.elements.find(e=>e.kind==='field'&&e.id===target.element);
  if(!before||!after||after.kind!=='field')fail('Existing G02 target Field is missing from its source',failPath);
  (after as any).nullability=(before as any).nullability;
 }else{
  if(oldModule!.elements.some(e=>e.id===target.element))fail('Appended G02 target must be new to the prior source',failPath);
  const fieldIndex=newModule!.elements.findIndex(e=>e.kind==='field'&&e.id===target.element);
  if(fieldIndex<oldModule!.elements.length||fieldIndex<0)fail('Appended G02 target Field must follow the retained module elements',failPath);
  const tableIndex=oldPayload?.tables?.findIndex?.((item:any)=>item.id===tableId)??-1;
  const oldTable=(oldPayload as any)?.tables?.[tableIndex],newTable=(newPayload as any)?.tables?.[tableIndex];
  const oldRecord=oldModule!.elements.find(e=>e.kind==='record'&&e.id===oldTable?.record?.element);
  const newRecord=newModule!.elements.find(e=>e.kind==='record'&&e.id===newTable?.record?.element) as any;
  if(!oldTable||!newTable||oldTable.id!==newTable.id||!oldRecord||!newRecord||!Array.isArray(newRecord.members))fail('Appended G02 target must belong to one retained table Record',failPath);
  const memberIndex=newRecord.members.findIndex((member:any)=>refKey(member)===refKey(target));
  if(memberIndex<0||memberIndex<(oldRecord as any).members.length)fail('Appended G02 target must be one new Record member',failPath);
  newRecord.members.splice(memberIndex,1);
  const mappingIndex=newTable.columns?.findIndex((column:any)=>refKey(column.field)===refKey(target))??-1;
  if(mappingIndex<0||mappingIndex!==newTable.columns.length-1)fail('Appended G02 target must be one final table column',failPath);
  newTable.columns.splice(mappingIndex,1);
  newModule!.elements.splice(fieldIndex,1);
 }
 if(!same(oldDocument,newDocument))fail('G02 source may change only the selected operation and target field/requiredness/mapping',failPath);
}

function validateAppendTarget(previous:TableDeploymentBundle,next:TableDeploymentBundle,table:string,target:TableRef,path:string):void{
 const oldTable=previous.expectedCatalog.tables.find(t=>t.id===table),newTable=next.expectedCatalog.tables.find(t=>t.id===table);
 const oldColumn=previous.expectedCatalog.columns.find(c=>c.table===table&&refKey(c.field)===refKey(target));
 const newColumn=next.expectedCatalog.columns.find(c=>c.table===table&&refKey(c.field)===refKey(target));
 const oldMapping=oldTable?.columns.find(c=>refKey(c.field)===refKey(target)),newMapping=newTable?.columns.find(c=>refKey(c.field)===refKey(target));
 const before=readDocument(previous.source.utf8,previous.source.format).modules.find(m=>m.id===target.module)?.elements.find(e=>e.id===target.element);
 const after=readDocument(next.source.utf8,next.source.format).modules.find(m=>m.id===target.module)?.elements.find(e=>e.id===target.element);
 if(oldColumn||oldMapping||!newColumn||newColumn.nullable||!newMapping||newMapping.generated||newMapping.immutable===true||newColumn.identity!==''||before||after?.kind!=='field'||after.nullability!=='required')fail('Appended target must be a newly declared ordinary required Field with no identity or generation',path);
 if(!next.source.utf8)fail('Appended target requires exact next-source evidence',path);
}
