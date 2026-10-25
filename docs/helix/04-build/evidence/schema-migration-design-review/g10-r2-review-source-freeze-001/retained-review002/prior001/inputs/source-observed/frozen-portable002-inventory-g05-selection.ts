import {compileTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import {hashCanonical,sha256Text} from '../compilation/bundle/hash';
import type {G10Options} from './inventory-options';

type Ref={module:string;element:string};
type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v:unknown,keys:string[]):v is Record<string,any>=>obj(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const refKey=(ref:Ref)=>JSON.stringify([ref.module,ref.element]);
function refuse(code:string,path:string):never{throw new Error(`G10_G05_${code}:${path}`);}
function document(bundle:TableDeploymentBundle):any {try{return JSON.parse(bundle.source.utf8);}catch{ return refuse('SOURCE_JSON', '/source');}}
function sourceTable(bundle:TableDeploymentBundle,id:string):{table:any;path:string}|undefined {
 const doc=document(bundle),module=doc.modules.find((m:any)=>m.id===bundle.module);if(!module)return;
 const payload=module.extensions?.['umf.tables'];if(!obj(payload)||!Array.isArray(payload.tables))return;
 const index=payload.tables.findIndex((table:any)=>table.id===id);if(index<0)return;
 return {table:payload.tables[index],path:`/modules/${doc.modules.indexOf(module)}/extensions/umf.tables/tables/${index}`};
}
function fieldDefinition(bundle:TableDeploymentBundle,ref:Ref):Json|null {
 const doc=document(bundle),module=doc.modules.find((m:any)=>m.id===ref.module),field=module?.elements.find((e:any)=>e.kind==='field'&&e.id===ref.element);return field?structuredClone(field) as Json:null;
}
function mapping(bundle:TableDeploymentBundle,table:string,ref:Ref):Json|null {
 const found=sourceTable(bundle,table);if(!found)return null;
 const declaration=found.table.columns.find((column:any)=>column.field?.module===ref.module&&column.field?.element===ref.element);
 return declaration?structuredClone(declaration) as Json:null;
}
export function sourceMappingPath(bundle:TableDeploymentBundle,table:string,ref:Ref):string|null {
 const found=sourceTable(bundle,table);if(!found)return null;
 const index=found.table.columns.findIndex((column:any)=>column.field?.module===ref.module&&column.field?.element===ref.element);
 return index<0?null:`${found.path}/columns/${index}`;
}
export function sourceFieldMeaning(bundle:TableDeploymentBundle,table:string,ref:Ref):Json|null {
 const logical=fieldDefinition(bundle,ref),physical=bundle.expectedCatalog.columns.find(column=>column.table===table&&refKey(column.field)===refKey(ref))??null,mapped=mapping(bundle,table,ref);
 if(logical===null||physical===null||mapped===null)return null;
 return {physical:structuredClone(physical) as unknown as Json,logical,mapping:mapped};
}
function sameTableBinding(previous:TableDeploymentBundle,next:TableDeploymentBundle,table:string):boolean {
 const old=previous.expectedCatalog.tables.find(row=>row.id===table),fresh=next.expectedCatalog.tables.find(row=>row.id===table);
 return !!old&&!!fresh&&old.record.module===fresh.record.module&&old.record.element===fresh.record.element&&previous.configuration.schema===next.configuration.schema&&old.name===fresh.name;
}
function targetCustody(value:unknown,path:string):void {
 const keys=['profile','custodianId','registrationId','resourceId','incarnation','registrationDigest'];
 if(!exact(value,keys)||value.profile!=='umf.native-target-custody/0.1'||keys.slice(1,5).some(key=>typeof value[key]!=='string'||!value[key])||!(/^[0-9a-f]{64}$/.test(value.registrationDigest)))refuse('TARGET_CUSTODY',path);
 for(const key of ['registrationId','resourceId','incarnation'])if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value[key]))refuse('TARGET_CUSTODY_UUID',`${path}/${key}`);
}
function selectedRef(value:any):string{return JSON.stringify([value.table,value.field.module,value.field.element]);}
function checkOverlap(options:G10Options):void {
 const selected=new Set<string>();
 const add=(table:string,field:Ref,path:string)=>{const key=JSON.stringify([table,field.module,field.element]);if(selected.has(key))refuse('DUPLICATE_FIELD_SELECTION',path);selected.add(key);};
 for(const [index,item]of (options.conversions as any[]).entries())add(item.table,item.field,`/options/conversions/${index}`);
 for(const [index,item]of (options.backfills as any[]).entries())add(item.table,item.column,`/options/backfills/${index}`);
 for(const [index,item]of (options.retirements as any[]).entries())add(item.table,item.field,`/options/retirements/${index}`);
 for(const [index,item]of (options.restorations as any[]).entries())add(item.table,item.field,`/options/restorations/${index}`);
}

/** Compare complete authored sources after projecting away only explicitly selected G05 carriers. */
export function sameSourceExceptG05SelectedFields(previous:TableDeploymentBundle,next:TableDeploymentBundle,options:G10Options,tableId:string):boolean {
 const selected=[...(options.retirements as any[]),...(options.restorations as any[])].filter(item=>item.table===tableId);
 if(selected.length===0)return false;
 const strip=(bundle:TableDeploymentBundle):Json=>{
  const doc=JSON.parse(bundle.source.utf8) as any;
  const module=doc.modules.find((row:any)=>row.id===bundle.module);
  const payload=module?.extensions?.['umf.tables'];
  const table=payload?.tables?.find((row:any)=>row.id===tableId);
  const recordModule=doc.modules.find((row:any)=>row.id===table?.record?.module);
  const record=recordModule?.elements?.find((row:any)=>row.id===table?.record?.element);
  if(!table||!record||!Array.isArray(table.columns)||!Array.isArray(record.members))refuse('SOURCE_DELTA_BINDING',`/modules/${bundle.module}/extensions/umf.tables`);
  const refs=new Set(selected.map(item=>refKey(item.field)));
  table.columns=table.columns.filter((column:any)=>!refs.has(refKey(column.field)));
  record.members=record.members.filter((member:any)=>!refs.has(refKey(member)));
  return {document:doc,configuration:structuredClone(bundle.configuration)} as unknown as Json;
 };
 return hashCanonical(strip(previous))===hashCanonical(strip(next));
}

/** Validate the G05 source/descriptor half. This is not history authority, archive custody, or a native capability. */
export function validateG05SourceSelections(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,options:G10Options):void {
 checkOverlap(options);
 const retirements=options.retirements as any[],restorations=options.restorations as any[],archiveSources=options.archiveSources as any[];
 const consumed=new Set<string>();
 for(const [index,item]of retirements.entries()){
  const path=`/options/retirements/${index}`;
  if(!previous||!sameTableBinding(previous,next,item.table))refuse('RETIREMENT_TABLE_BINDING',path);
  const before=mapping(previous,item.table,item.field),after=mapping(next,item.table,item.field);
  if(!before||after!==null)refuse('RETIREMENT_FIELD_DELTA',path+'/field');
  const oldMeaning=sourceFieldMeaning(previous,item.table,item.field);if(oldMeaning===null)refuse('RETIREMENT_MEANING',path+'/field');
  if(!exact(item.retention,['policyId','policyRevision','minimumRetentionMs'])||typeof item.retention.policyId!=='string'||!item.retention.policyId||new TextEncoder().encode(item.retention.policyId).length>128||!Number.isSafeInteger(item.retention.policyRevision)||item.retention.policyRevision<1||!Number.isSafeInteger(item.retention.minimumRetentionMs)||item.retention.minimumRetentionMs<0||item.retention.minimumRetentionMs>315360000000)refuse('RETENTION_POLICY',path+'/retention');
 }
 const sourceByDigest=new Map<string,TableDeploymentBundle>();
 for(const [index,entry]of archiveSources.entries()){
  const path=`/options/archiveSources/${index}`;
  if(!exact(entry,['digest','source'])||!exact(entry.source,['format','utf8'])||entry.source.format!=='json'||typeof entry.source.utf8!=='string'||sha256Text(entry.source.utf8)!==entry.digest)refuse('ARCHIVE_SOURCE',path);
  const compiled=compileTableDeployment({text:entry.source.utf8,format:'json',configuration:next.configuration});
  if(compiled.status!=='compiled'||compiled.bundle.sourceDigest!==entry.digest)refuse('ARCHIVE_SOURCE_COMPILE',path+'/source');
  sourceByDigest.set(entry.digest,compiled.bundle);
 }
 for(const [index,item]of restorations.entries()){
  const path=`/options/restorations/${index}`;
  if(!previous||!sameTableBinding(previous,next,item.table))refuse('RESTORATION_TABLE_BINDING',path);
  if(mapping(previous,item.table,item.field)!==null||mapping(next,item.table,item.field)===null)refuse('RESTORATION_FIELD_DELTA',path+'/field');
  targetCustody(item.archive.targetCustody,path+'/archive/targetCustody');
  const old=sourceByDigest.get(item.archive.retirementSourceDigest);if(!old)refuse('RESTORATION_SOURCE_MISSING',path+'/archive/retirementSourceDigest');
  const oldTable=sourceTable(old,item.table),nextTable=sourceTable(next,item.table);
  if(!oldTable||!nextTable||oldTable.table.record?.module!==nextTable.table.record?.module||oldTable.table.record?.element!==nextTable.table.record?.element)refuse('RESTORATION_ORIGINAL_TABLE',path+'/archive');
  if(mapping(old,item.table,item.field)===null)refuse('RESTORATION_ORIGINAL_MAPPING',path+'/archive');
  const originalMeaning=sourceFieldMeaning(old,item.table,item.field),restoredMeaning=sourceFieldMeaning(next,item.table,item.field);
  if(originalMeaning===null||restoredMeaning===null||hashCanonical(originalMeaning)!==hashCanonical(restoredMeaning)||hashCanonical(originalMeaning)!==item.archive.fieldMeaningDigest)refuse('RESTORATION_MEANING',path+'/archive/fieldMeaningDigest');
  consumed.add(item.archive.retirementSourceDigest);
  if(item.newInstances.mode==='null'&&next.expectedCatalog.columns.find(column=>column.table===item.table&&refKey(column.field)===refKey(item.field))?.nullable!==true)refuse('RESTORATION_NULLABILITY',path+'/newInstances');
 }
 for(const digest of sourceByDigest.keys())if(!consumed.has(digest))refuse('ARCHIVE_SOURCE_UNUSED',`/options/archiveSources/${digest}`);
}
