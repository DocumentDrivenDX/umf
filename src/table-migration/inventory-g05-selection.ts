import {compileTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import {hashCanonical,sha256Text} from '../compilation/bundle/hash';
import {copyJsonCharged} from '../model/json';
import type {AccountingContext} from '../model/internal/accounting-context';
import type {G10Options} from './inventory-options';

type Ref={module:string;element:string};
type Json=null|boolean|number|string|Json[]|{[key:string]:Json};

/** Opaque parsed-source maps; no caller-owned Map escapes the WeakMap. */
export type OwnedSourceFieldIndex=object;
interface OwnedSourceFieldIndexState{
 readonly bundle:TableDeploymentBundle;readonly source:any;
 readonly moduleById:Map<string,any>;readonly elementByRef:Map<string,any>;readonly elementPathByRef:Map<string,string>;
 readonly tableById:Map<string,any>;readonly mappingByRef:Map<string,any>;
 readonly physicalByRef:Map<string,any>;readonly pathByRef:Map<string,string>;
 readonly sourcePathValues:Map<string,Json>;readonly sourcePathOrder:Map<string,number>;
 readonly accounting?:AccountingContext;
}
const ownedSourceFieldIndexes=new WeakMap<object,OwnedSourceFieldIndexState>();
function jsonStringBytes(value:string):number{let bytes=2;for(let i=0;i<value.length;i++){const unit=value.charCodeAt(i);if(unit===34||unit===92){bytes+=2;continue;}if(unit<0x20){bytes+=unit===8||unit===9||unit===10||unit===12||unit===13?2:6;continue;}if(unit>=0xd800&&unit<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;continue;}if(unit>=0xd800&&unit<=0xdfff){bytes+=6;continue;}bytes+=unit<0x80?1:unit<0x800?2:3;}return bytes;}
function tupleKey(accounting:AccountingContext|undefined,path:string,...parts:string[]):string{
 if(accounting){accounting.visit('source-index-tuple-carrier',path,parts.length);let codeUnits=0;for(const part of parts)codeUnits+=part.length;accounting.visit('source-index-tuple-scan',path,codeUnits);let bytes=2+(parts.length-1);for(const part of parts)bytes+=jsonStringBytes(part);accounting.retainBytes('source-index-tuple-key',bytes,path);accounting.visit('source-index-tuple-serialize',path,codeUnits);}
 return JSON.stringify(parts);
}
function retainIndexKey(key:string,accounting:AccountingContext|undefined,path:string):void{if(accounting){const bytes=accounting.scanUtf8(key,path);accounting.retainBytes('source-index-retained-map-key',bytes,path);}}
const pointerPart=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
function sourceIndexChildPath(parent:string,segment:string,accounting:AccountingContext|undefined,where:string):string{
 if(!accounting)return `${parent}/${pointerPart(segment)}`;
 const segmentBytes=accounting.scanUtf8(segment,where);accounting.visit('source-index-path-escape-scan',where,segment.length);
 let tildes=0,slashes=0;for(let index=0;index<segment.length;index++){const unit=segment.charCodeAt(index);if(unit===126)tildes++;else if(unit===47)slashes++;}
 const onceBytes=segmentBytes+tildes;accounting.retainBytes('source-index-path-tilde-escape',onceBytes,where);
 const once=segment.replace(/~/g,'~0');accounting.retainBytes('source-index-path-slash-escape',onceBytes+slashes,where);
 const escaped=once.replace(/\//g,'~1'),parentBytes=accounting.scanUtf8(parent,where);
 accounting.retainBytes('source-index-path-retained-key',parentBytes+1+onceBytes+slashes,where);
 return `${parent}/${escaped}`;
}
export function sourceChildPathFromIndex(index:OwnedSourceFieldIndex,parent:string,segment:string,where:string):string{
 return sourceIndexChildPath(parent,segment,sourceIndexState(index).accounting,where);
}
/** Build once from the same compiler-owned parsed source used by projection. */
export function buildOwnedSourceFieldIndex(bundle:TableDeploymentBundle,source:any,accounting?:AccountingContext):OwnedSourceFieldIndex{
 accounting?.visit('source-index-map-carriers','/source/index',9);
 const moduleById=new Map<string,any>(),elementByRef=new Map<string,any>(),elementPathByRef=new Map<string,string>(),tableById=new Map<string,any>(),mappingByRef=new Map<string,any>(),physicalByRef=new Map<string,any>(),pathByRef=new Map<string,string>(),sourcePathValues=new Map<string,Json>(),sourcePathOrder=new Map<string,number>();
 const moduleCount=Array.isArray(source.modules)?source.modules.length:0;accounting?.visit('source-index-modules','/source/modules',moduleCount);
 for(const[moduleIndex,module]of (source.modules??[]).entries()){
  if(typeof module?.id==='string'){const path=`/source/modules/${moduleIndex}`;accounting?.visit('source-index-module-map-retention',path);retainIndexKey(module.id,accounting,path);moduleById.set(module.id,module);}
  const elements=Array.isArray(module?.elements)?module.elements:[];accounting?.visit('source-index-elements',`/modules/${moduleIndex}/elements`,elements.length);
  for(const[elementIndex,element]of elements.entries())if(typeof module?.id==='string'&&typeof element?.id==='string'){const path=`/modules/${moduleIndex}/elements/${elementIndex}`,key=tupleKey(accounting,path,module.id,element.id);accounting?.visit('source-index-element-map-retention',path,2);retainIndexKey(key,accounting,path);retainIndexKey(key,accounting,path);retainIndexKey(path,accounting,path);elementByRef.set(key,element);elementPathByRef.set(key,path);}
 }
 let moduleIndex=-1;for(let index=0;index<(source.modules??[]).length;index++){accounting?.visit('source-index-module-lookup',`/source/modules/${index}`);if(source.modules[index]?.id===bundle.module){moduleIndex=index;break;}}
 const payload=moduleIndex<0?null:source.modules[moduleIndex]?.extensions?.['umf.tables'];
 if(Array.isArray(payload?.tables))for(const[tableIndex,table]of payload.tables.entries()){
  if(typeof table?.id!=='string')continue;const tablePath=`/modules/${moduleIndex}/extensions/umf.tables/tables/${tableIndex}`;accounting?.visit('source-index-table-map-retention',tablePath);retainIndexKey(table.id,accounting,tablePath);tableById.set(table.id,table);
  const columns=Array.isArray(table.columns)?table.columns:[];accounting?.visit('source-index-mappings',`/modules/${moduleIndex}/extensions/umf.tables/tables/${tableIndex}/columns`,columns.length);
  for(const[columnIndex,column]of columns.entries())if(typeof column?.field?.module==='string'&&typeof column.field.element==='string'){
   const path=`/modules/${moduleIndex}/extensions/umf.tables/tables/${tableIndex}/columns/${columnIndex}`,key=tupleKey(accounting,path,table.id,column.field.module,column.field.element);accounting?.visit('source-index-mapping-map-retention',path,2);retainIndexKey(key,accounting,path);retainIndexKey(key,accounting,path);retainIndexKey(path,accounting,path);mappingByRef.set(key,column);pathByRef.set(key,path);
  }
 }
 const physical=Array.isArray(bundle.expectedCatalog?.columns)?bundle.expectedCatalog.columns:[];accounting?.visit('source-index-physical-columns','/expectedCatalog/columns',physical.length);
 for(let index=0;index<physical.length;index++){const column=physical[index]!;if(typeof column?.table==='string'&&typeof column.field?.module==='string'&&typeof column.field.element==='string'){const path=`/expectedCatalog/columns/${index}`;const key=tupleKey(accounting,path,column.table,column.field.module,column.field.element);accounting?.visit('source-index-physical-map-retention',path);retainIndexKey(key,accounting,path);physicalByRef.set(key,column);}}
 accounting?.visit('source-path-index-stack-carrier','/source',1);const stack:{value:Json;path:string}[]=[{value:source as Json,path:''}];
 let sourceOrdinal=0;while(stack.length){const current=stack.pop()!;const currentPath=current.path||'/source';accounting?.visit('source-path-index-node',currentPath);accounting?.visit('source-path-index-map-retention',currentPath,2);retainIndexKey(current.path,accounting,currentPath);retainIndexKey(current.path,accounting,currentPath);sourcePathValues.set(current.path,current.value);sourcePathOrder.set(current.path,sourceOrdinal++);if(Array.isArray(current.value)){accounting?.visit('source-path-array-slots',currentPath,current.value.length);for(let i=current.value.length-1;i>=0;i--){accounting?.visit('source-path-stack-retention',currentPath);const path=sourceIndexChildPath(current.path,String(i),accounting,currentPath);stack.push({value:current.value[i]!,path});}}else if(current.value!==null&&typeof current.value==='object'){const keys:string[]=[];for(const key in current.value){if(!Object.hasOwn(current.value,key))continue;accounting?.visit('source-path-object-member-enumeration',currentPath);accounting?.visit('source-path-object-key-retention',currentPath);keys.push(key);}for(let i=keys.length-1;i>=0;i--){const key=keys[i]!;accounting?.visit('source-path-stack-retention',currentPath);const path=sourceIndexChildPath(current.path,key,accounting,currentPath);stack.push({value:(current.value as Record<string,Json>)[key]!,path});}}}
 accounting?.visit('source-index-state-construction','/source/index',12);const state={bundle,source,moduleById,elementByRef,elementPathByRef,tableById,mappingByRef,physicalByRef,pathByRef,sourcePathValues,sourcePathOrder,...(accounting?{accounting}:{})};accounting?.visit('source-index-handle-construction','/source/index');const handle=Object.freeze({});accounting?.visit('source-index-weakmap-retention','/source/index');ownedSourceFieldIndexes.set(handle,state);return handle;
}
function sourceIndexState(index:OwnedSourceFieldIndex):OwnedSourceFieldIndexState{
 const state=ownedSourceFieldIndexes.get(index);if(!state)throw new TypeError('G05_SOURCE_INDEX_NOT_OWNED');return state;
}
export function sourceElementFromIndex(index:OwnedSourceFieldIndex,ref:Ref):{value:any;path:string}|null{const state=sourceIndexState(index),key=tupleKey(state.accounting,'/source/index/field-lookup',ref.module,ref.element),value=state.elementByRef.get(key),path=state.elementPathByRef.get(key);return value===undefined||path===undefined?null:{value,path};}
export function sourceFieldMeaningFromIndex(index:OwnedSourceFieldIndex,table:string,ref:Ref,accounting?:AccountingContext):Json|null{
 const state=sourceIndexState(index),meter=accounting??state.accounting,key=tupleKey(meter,'/source/index/field-meaning',table,ref.module,ref.element),logical=state.elementByRef.get(tupleKey(meter,'/source/index/field-meaning',ref.module,ref.element)),physical=state.physicalByRef.get(key),mapped=state.mappingByRef.get(key);
 if(logical?.kind!=='field'||physical===undefined||mapped===undefined)return null;
 meter?.visit('source-field-meaning-clones',`/field/${table}/${ref.module}/${ref.element}`,3);
 const hooks=meter?{beforeProperty:(name:string,path:string,array:boolean)=>{meter.visit('source-field-copy-property-preflight',path);if(!array)meter.scanUtf8(name,path);},retainText:(text:string,path:string)=>{meter.scanUtf8(text,path);}}:undefined;
 return {physical:meter?copyJsonCharged(physical,n=>meter.visit('source-field-physical-copy','/field/physical',n),hooks) as unknown as Json:structuredClone(physical) as Json,logical:meter?copyJsonCharged(logical,n=>meter.visit('source-field-logical-copy','/field/logical',n),hooks) as unknown as Json:structuredClone(logical) as Json,mapping:meter?copyJsonCharged(mapped,n=>meter.visit('source-field-mapping-copy','/field/mapping',n),hooks) as unknown as Json:structuredClone(mapped) as Json};
}
export function sourceMappingPathFromIndex(index:OwnedSourceFieldIndex,table:string,ref:Ref):string|null{
	const state=sourceIndexState(index);return state.pathByRef.get(tupleKey(state.accounting,'/source/index/mapping-path',table,ref.module,ref.element))??null;
}
export function sourceValueAtPathFromIndex(index:OwnedSourceFieldIndex,path:string):Json|undefined{
 return sourceIndexState(index).sourcePathValues.get(path);
}
export function sourceHasPathInIndex(index:OwnedSourceFieldIndex,path:string):boolean{return sourceIndexState(index).sourcePathValues.has(path);}
export function sourcePathOrdinalFromIndex(index:OwnedSourceFieldIndex,path:string):number|undefined{return sourceIndexState(index).sourcePathOrder.get(path);}
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
