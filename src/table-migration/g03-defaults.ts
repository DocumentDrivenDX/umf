// SPDX-License-Identifier: MIT OR Apache-2.0
import {readDocument} from '../model/document';
import {copyJson} from '../model/json';
import {checkSchemaLiteral,literalIdentity,schemaCoefficient} from '../model/schema-literals';
import {UmfError,type Document,type Element} from '../model/types';
import type {TableDefault,TableRef} from '../extensions/tables';
import type {TableDeploymentBundle} from '../table-deployment';
import {typedDefaultExpressionSql} from '../table-deployment/sql';
import {nativeDate,nativeInstant} from '../extensions/tables/temporal';
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import type {ReviewedChangeMarker} from './reviewed';

export interface G03DefaultChange extends ReviewedChangeMarker {
 kind:'change-default';
 oldValue:{target:{table:string;field:TableRef};physicalExpectation:unknown;logicalField:Element;nativeMapping:unknown;nativeDefault:{present:boolean;value:unknown};logicalDefault:{present:boolean;value:unknown}};
 newValue:{target:{table:string;field:TableRef};physicalExpectation:unknown;logicalField:Element;nativeMapping:unknown;nativeDefault:{present:boolean;value:unknown};logicalDefault:{present:boolean;value:unknown}};
}

const same=(a:unknown,b:unknown):boolean=>canonical(a)===canonical(b);
const owns=(value:object,key:string):boolean=>Object.hasOwn(value,key);
const pathFor=(moduleIndex:number,tableIndex:number,columnIndex:number):string=>
 '/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/columns/'+columnIndex+'/default';
const presence=(value:unknown)=>({present:value!==undefined,value:value===undefined?null:value});
const fail=(code:string,message:string,path:string):never=>{throw new UmfError(code,message,path);};

interface LocatedMapping {moduleIndex:number;tableIndex:number;columnIndex:number;table:any;column:any;field:Element;ref:TableRef;path:string}
function mappings(bundle:TableDeploymentBundle):LocatedMapping[]{
 const doc=readDocument(bundle.source.utf8,bundle.source.format),moduleIndex=doc.modules.findIndex(module=>module.id===bundle.module);
 const module=doc.modules[moduleIndex],payload=module?.extensions?.['umf.tables'] as any;
 if(!module||!payload||!Array.isArray(payload.tables))return [];
 const result:LocatedMapping[]=[];
 for(const [tableIndex,table] of payload.tables.entries())for(const [columnIndex,column] of (table.columns??[]).entries()){
  const field=doc.modules.find(item=>item.id===column.field?.module)?.elements.find(item=>item.id===column.field?.element);
  if(field?.kind==='field')result.push({moduleIndex,tableIndex,columnIndex,table,column,field,ref:column.field,path:pathFor(moduleIndex,tableIndex,columnIndex)});
 }
 return result;
}

/** Add only opt-in G03 candidates; the unselected legacy result stays byte-identical. */
export function discoverG03DefaultChanges(previous:TableDeploymentBundle,next:TableDeploymentBundle):G03DefaultChange[]{
 return discoverG03DefaultChangesInternal(previous,next,null);
}
/** Internal G10 sink for bounded collection without an intermediate result array. */
export function consumeG03DefaultChangesBounded(previous:TableDeploymentBundle,next:TableDeploymentBundle,maxCandidates:number,maxBytes:number,accept:(candidate:G03DefaultChange)=>void):void{
 if(!Number.isSafeInteger(maxCandidates)||maxCandidates<0||!Number.isSafeInteger(maxBytes)||maxBytes<0)throw new RangeError('Invalid internal discovery bounds');
 discoverG03DefaultChangesInternal(previous,next,{maxCandidates,maxBytes,accept});
}
function discoverG03DefaultChangesInternal(previous:TableDeploymentBundle,next:TableDeploymentBundle,bounds:{maxCandidates:number;maxBytes:number;accept?:(candidate:G03DefaultChange)=>void}|null):G03DefaultChange[]{
 if(previous.source.format!=='json'||next.source.format!=='json')return [];
 const oldRows=mappings(previous),newRows=mappings(next),result:G03DefaultChange[]=[];let count=0;
 for(const fresh of newRows){
  const old=oldRows.find(item=>item.table.id===fresh.table.id&&item.ref.module===fresh.ref.module&&item.ref.element===fresh.ref.element);
  if(!old)continue;
  const oldNative=presence(old.column.default),newNative=presence(fresh.column.default);
  const oldLogical=presence((old.field as any).default),newLogical=presence((fresh.field as any).default);
  if(same(oldNative,newNative)&&same(oldLogical,newLogical))continue;
  // A logical-only default change is never a candidate: native storage is the
  // authority for omission behavior and must itself change in this profile.
  if(same(oldNative,newNative))continue;
  // Refuse an exhausted bounded sink before constructing values or hashes.
  if(bounds&&count>=bounds.maxCandidates)fail('TABLE_MIGRATION_OPTIONS','Bounded discovery exceeds its candidate limit',fresh.path);
  const oldPhysical=previous.expectedCatalog.columns.find(column=>column.table===old.table.id&&column.field.module===old.ref.module&&column.field.element===old.ref.element);
  const newPhysical=next.expectedCatalog.columns.find(column=>column.table===fresh.table.id&&column.field.module===fresh.ref.module&&column.field.element===fresh.ref.element);
  const oldValue={target:{table:old.table.id,field:old.ref},physicalExpectation:oldPhysical??null,logicalField:old.field,nativeMapping:old.column,nativeDefault:oldNative,logicalDefault:oldLogical};
  const newValue={target:{table:fresh.table.id,field:fresh.ref},physicalExpectation:newPhysical??null,logicalField:fresh.field,nativeMapping:fresh.column,nativeDefault:newNative,logicalDefault:newLogical};
  const oldDigest=hashCanonical(oldValue),newDigest=hashCanonical(newValue),kind='change-default' as const;
  const candidate={id:'review-'+hashCanonical([kind,fresh.path,oldDigest,newDigest]).slice(0,24),kind,path:fresh.path,oldDigest,newDigest,oldValue,newValue};
  if(bounds){const size=new TextEncoder().encode(canonical(candidate)).byteLength;if(size>bounds.maxBytes)fail('TABLE_MIGRATION_OPTIONS','Bounded discovery exceeds its byte limit',fresh.path);bounds.maxBytes-=size;}
  count++;if(bounds?.accept)bounds.accept(candidate);else result.push(candidate);
 }
 return result;
}

export function validateG03DefaultChange(previous:TableDeploymentBundle,next:TableDeploymentBundle,markers:unknown):G03DefaultChange{
 if(previous.source.format!=='json')fail('TABLE_MIGRATION_OPTIONS','Version 0.5 requires exact JSON retained sources','/previous/source/format');
 if(next.source.format!=='json')fail('TABLE_MIGRATION_OPTIONS','Version 0.5 requires exact JSON retained sources','/next/source/format');
 const markerList=Array.isArray(markers)?markers:[];
 if(markerList.length!==1||!markerList[0]||typeof markerList[0]!=='object'||(markerList[0] as any).kind!=='change-default')fail('TABLE_MIGRATION_OPTIONS','G03 requires exactly one change-default marker','/options/reviewedChanges');
 const marker=markerList[0] as ReviewedChangeMarker,candidateMaybe=discoverG03DefaultChanges(previous,next).find(item=>item.id===marker.id);
 if(!candidateMaybe||candidateMaybe.path!==marker.path||candidateMaybe.oldDigest!==marker.oldDigest||candidateMaybe.newDigest!==marker.newDigest)fail('TABLE_MIGRATION_OPTIONS','Marker does not bind the exact selected native/logical default transition','/options/reviewedChanges/0');
 const candidate=candidateMaybe!;
 const oldRows=mappings(previous),newRows=mappings(next),oldMaybe=oldRows.find(item=>item.path===candidate.path),freshMaybe=newRows.find(item=>item.path===candidate.path);
 if(!oldMaybe||!freshMaybe||oldMaybe.table.id!==freshMaybe.table.id||oldMaybe.ref.module!==freshMaybe.ref.module||oldMaybe.ref.element!==freshMaybe.ref.element)fail('TABLE_MIGRATION_UNSUPPORTED','Selected default target is not one retained table Field','/next/source'+candidate.path);
 const old=oldMaybe!,fresh=freshMaybe!;
 if(old.table.record?.module!==fresh.table.record?.module||old.table.record?.element!==fresh.table.record?.element)fail('TABLE_MIGRATION_UNSUPPORTED','Selected table identity changed','/next/source'+candidate.path);
 if(old.column.generated||fresh.column.generated)fail('TABLE_MIGRATION_UNSUPPORTED','Generated columns cannot change defaults','/next/source'+candidate.path);
 if(!same(old.field.kind,fresh.field.kind)||old.field.kind!=='field'||fresh.field.kind!=='field')fail('TABLE_MIGRATION_UNSUPPORTED','Selected target must remain one stored Field','/next/source'+candidate.path);
 if(previous.module!==next.module||!same(previous.configuration,next.configuration))fail('TABLE_MIGRATION_UNSUPPORTED','Module and native configuration must remain unchanged','/next/source');
 // Whole-source closure: after removing exactly the selected native and logical
 // default properties, every parsed source value and ordered array must match.
 const oldDoc=readDocument(previous.source.utf8,'json'),newDoc=readDocument(next.source.utf8,'json');
 const oldCopy=copyJson(oldDoc) as any,newCopy=copyJson(newDoc) as any;
 const oldMapping=oldCopy.modules[old.moduleIndex].extensions['umf.tables'].tables[old.tableIndex].columns[old.columnIndex];
 const newMapping=newCopy.modules[fresh.moduleIndex].extensions['umf.tables'].tables[fresh.tableIndex].columns[fresh.columnIndex];
 const oldField=oldCopy.modules.find((module:any)=>module.id===old.ref.module)?.elements.find((item:any)=>item.id===old.ref.element);
 const newField=newCopy.modules.find((module:any)=>module.id===fresh.ref.module)?.elements.find((item:any)=>item.id===fresh.ref.element);
 delete oldMapping.default;delete newMapping.default;delete oldField.default;delete newField.default;
 if(!same(oldCopy,newCopy))fail('TABLE_MIGRATION_UNSUPPORTED','Only the selected native and logical default properties may change','/next/source');
 // The independently recompiled physical catalog may differ only in that
 // same declaration and its resulting column definition text.
 const oldCatalog=copyJson(previous.expectedCatalog) as any,newCatalog=copyJson(next.expectedCatalog) as any;
 const oldTable=oldCatalog.tables.find((item:any)=>item.id===old.table.id),newTable=newCatalog.tables.find((item:any)=>item.id===fresh.table.id);
 const oldPhysical=oldTable?.columns.find((item:any)=>item.field.module===old.ref.module&&item.field.element===old.ref.element);
 const newPhysical=newTable?.columns.find((item:any)=>item.field.module===fresh.ref.module&&item.field.element===fresh.ref.element);
 if(!oldPhysical||!newPhysical)fail('TABLE_MIGRATION_UNSUPPORTED','Selected mapping is not present in the native catalog','/next/expectedCatalog');
 delete oldPhysical.default;delete newPhysical.default;oldPhysical.sourcePath=null;newPhysical.sourcePath=null;
 oldCatalog.columns.find((item:any)=>item.table===old.table.id&&item.field.module===old.ref.module&&item.field.element===old.ref.element).definitionSql=null;
 newCatalog.columns.find((item:any)=>item.table===fresh.table.id&&item.field.module===fresh.ref.module&&item.field.element===fresh.ref.element).definitionSql=null;
 if(!same(oldCatalog,newCatalog))fail('TABLE_MIGRATION_UNSUPPORTED','Native catalog may change only the selected default expression','/next/expectedCatalog');
 validateDefaultPair(old.field as Element,old.column,old.column.default,oldDoc,'/previous/source'+old.path,false);
 validateDefaultPair(fresh.field as Element,fresh.column,fresh.column.default,newDoc,'/next/source'+fresh.path,true);
 return candidate;
}

function validateDefaultPair(field:Element,column:any,value:unknown,doc:Document,path:string,g03Target:boolean):void{
 if(value!==undefined){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('TABLE_MIGRATION_UNSUPPORTED','Selected default must use the closed native-default vocabulary',path);
  const d=value as any;
  if(d.kind==='literal'){
   if(Object.keys(d).some(key=>!['kind','value'].includes(key))||!owns(d,'value'))fail('TABLE_MIGRATION_UNSUPPORTED','Unknown native literal-default qualifiers are retained and block G03',path);
   validateLiteralDomain(doc,field,column,d.value,path+'/value');
   validateNativeCapacity(field,column,d.value,path+'/value');
  }else if(d.kind==='currentTimestamp'){
   if(Object.keys(d).length!==1||column.nativeType.kind!=='timestamptz')fail('TABLE_MIGRATION_UNSUPPORTED','Current timestamp default requires timestamptz and no qualifiers',path);
   if(g03Target)rejectVolatileRefinement(field,path);
  }else if(d.kind==='randomUuid'){
   if(Object.keys(d).length!==1||column.nativeType.kind!=='uuid')fail('TABLE_MIGRATION_UNSUPPORTED','Random UUID default requires UUID storage and no qualifiers',path);
   if(g03Target)rejectVolatileRefinement(field,path);
  }else fail('TABLE_MIGRATION_UNSUPPORTED','Unknown native default kind',path);
 }
 const logical=(field as any).default;
 if(logical!==undefined){
  const moduleIndex=doc.modules.findIndex(module=>module.elements.includes(field)),elementIndex=doc.modules[moduleIndex]?.elements.findIndex(element=>element.id===field.id)??-1;
  const logicalPath=moduleIndex>=0&&elementIndex>=0?'/'+(path.startsWith('/previous/')?'previous':'next')+'/source/modules/'+moduleIndex+'/elements/'+elementIndex+'/default':path;
  if(!logical||typeof logical!=='object'||Array.isArray(logical)||Object.keys(logical).some(key=>!['value','on'].includes(key))||!owns(logical,'value')||logical.on!=='missing')fail('TABLE_MIGRATION_UNSUPPORTED','Logical default must be a closed missing-only literal',logicalPath);
  if((value as any)?.kind!=='literal'||literalIdentity(field,logical.value)!==literalIdentity(field,(value as any).value))fail('TABLE_MIGRATION_UNSUPPORTED','Logical and native literal defaults must retain the matching missing-only rule',logicalPath);
 }
}

/** G03 admits exact unrefined date/instant literals; other domains retain full refinement checks. */
function validateLiteralDomain(doc:Document,field:Element,column:any,value:unknown,path:string):void{
 if(field.scalarType==='date'||field.scalarType==='timestamp'){
  if(Object.keys((field as any).facets??{}).length||((field as any).allowedValues?.length??0)>0)
   fail('TABLE_MIGRATION_UNSUPPORTED','Temporal refinements require a separately qualified native interpretation',path);
  const expectedNative=field.scalarType==='date'?'date':'timestamptz';
  if(column.nativeType?.kind!==expectedNative)
   fail('TABLE_MIGRATION_UNSUPPORTED','Temporal literal requires its exact qualified native type',path);
  checkSchemaLiteral(doc,field,value,false);
  if(value!==null){
   if(field.scalarType==='date')nativeDate((value as any).date);
   else nativeInstant((value as any).timestamp);
  }
  return;
 }
 checkSchemaLiteral(doc,field,value,true);
}

function rejectVolatileRefinement(field:Element,path:string):void{
 const x=field as any;
 if((Array.isArray(x.allowedValues)&&x.allowedValues.length>0)||x.facets?.range!==undefined)fail('TABLE_MIGRATION_UNSUPPORTED','Volatile defaults on enumerated or ranged Fields are not qualified',path);
}

function validateNativeCapacity(field:Element,column:any,value:any,path:string):void{
 if(value===null){if(field.nullability==='required')fail('TABLES_NATIVE_CAPACITY','Literal NULL requires a nullable Field',path);return;}
 const type=column.nativeType;
 validateRawNativeCapacity(column.nativeType,value,path,path.replace(/\/default(?:\/value)?$/,'/nativeType'));
 if('string'in value&&['varchar','char'].includes(type.kind)&&[...value.string].length>type.length)fail('TABLES_NATIVE_CAPACITY','String exceeds native character capacity',path);
}

/** Fast G03-only literal preflight run before deployment bundles are recompiled/rendered. */
export function preflightG03DefaultLiteral(input:unknown):void{
 const raw=input as any;
 const safeContainer=(value:any):boolean=>{
  if(!value||typeof value!=='object')return false;
  const prototype=Object.getPrototypeOf(value);
  return Array.isArray(value)?prototype===Array.prototype:prototype===Object.prototype||prototype===null;
 };
 const hasAccessor=(value:any):boolean=>!!value&&typeof value==='object'&&Object.values(Object.getOwnPropertyDescriptors(value)).some((item:any)=>!('value'in item));
 const ownData=(value:any,key:string):any=>{const descriptor=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):undefined;return descriptor&&'value'in descriptor?descriptor.value:undefined;};
 if(!safeContainer(raw)||hasAccessor(raw))return;
 const options=ownData(raw,'options');if(!safeContainer(options)||hasAccessor(options)||ownData(options,'version')!=='umf.table-migration-options/0.5')return;
 const reviewedChanges=ownData(options,'reviewedChanges');
 if(!safeContainer(reviewedChanges)||hasAccessor(reviewedChanges))return;
 for(let index=0;index<reviewedChanges.length;index++){const item=ownData(reviewedChanges,String(index));if(!safeContainer(item)||hasAccessor(item))return;}
 const backfills=ownData(options,'backfills'),concurrentIndexes=ownData(options,'concurrentIndexes'),validations=ownData(options,'validations');
 if(!Array.isArray(backfills)||backfills.length||!Array.isArray(concurrentIndexes)||concurrentIndexes.length||!Array.isArray(validations)||validations.length||!Array.isArray(reviewedChanges)||reviewedChanges.length!==1)fail('TABLE_MIGRATION_OPTIONS','G03 requires exactly one reviewed default-change marker and no other options','/options');
 const marker=ownData(reviewedChanges,'0');
 if(!marker||typeof marker!=='object'||Object.keys(marker).sort().join(',')!=='id,kind,newDigest,oldDigest,path'||marker.kind!=='change-default'||typeof marker.path!=='string')fail('TABLE_MIGRATION_OPTIONS','G03 marker must be exact and select one change-default path','/options/reviewedChanges/0');
 const previous=ownData(raw,'previous') as TableDeploymentBundle|null;if(!previous)return fail('TABLE_MIGRATION_OPTIONS','Version 0.5 default changes require a retained predecessor','/previous');
 const next=ownData(raw,'next') as TableDeploymentBundle|undefined;if(!next)return fail('TABLE_MIGRATION_OPTIONS','Version 0.5 default changes require a next source','/next');
 const rawSource=(bundle:any,side:'previous'|'next')=>{
  if(!safeContainer(bundle)||hasAccessor(bundle))return undefined;
  const source=ownData(bundle,'source'),configuration=ownData(bundle,'configuration');
  if(!source||typeof source!=='object')fail('TABLE_MIGRATION_OPTIONS','G03 requires retained source bytes','/'+side+'/source');
  if(!safeContainer(source)||hasAccessor(source))return undefined;
  const format=ownData(source,'format'),utf8=ownData(source,'utf8');
  if(format!=='json')fail('TABLE_MIGRATION_OPTIONS','Version 0.5 default changes require JSON source bytes','/'+side+'/source/format');
  if(typeof utf8!=='string')fail('TABLE_MIGRATION_OPTIONS','G03 source UTF-8 text is required','/'+side+'/source/utf8');
  if(utf8.length>4_000_000)fail('TABLE_DEPLOYMENT_UNSUPPORTED','G03 source exceeds the existing 4 MB source bound','/'+side+'/source');
  if(!configuration||typeof configuration!=='object')fail('TABLE_MIGRATION_OPTIONS','G03 requires a qualified native schema identifier','/'+side+'/configuration/schema');
  if(!safeContainer(configuration)||hasAccessor(configuration))return undefined;
  const schema=ownData(configuration,'schema');
  if(typeof schema!=='string')fail('TABLE_MIGRATION_OPTIONS','G03 requires a qualified native schema identifier','/'+side+'/configuration/schema');
  if(schema.length>1_049_600)fail('TABLES_NATIVE_CAPACITY','G03 schema identifier exceeds the bounded statement size','/'+side+'/configuration/schema');
  return utf8 as string;
 };
 const previousText=rawSource(previous,'previous'),nextText=rawSource(next,'next');
 if(previousText===undefined||nextText===undefined)return;
 const matchMaybe=/^\/modules\/(\d+)\/extensions\/umf\.tables\/tables\/(\d+)\/columns\/(\d+)\/default$/.exec(marker.path);
 if(!matchMaybe)fail('TABLE_MIGRATION_OPTIONS','G03 marker path must identify a selected native column default','/options/reviewedChanges/0/path');
 const match=matchMaybe!;
 const inspect=(bundle:TableDeploymentBundle,side:'previous'|'next',sourceText:string)=>{
 let doc:any;try{doc=JSON.parse(sourceText);}catch{fail('TABLE_MIGRATION_OPTIONS','G03 '+side+' source must be parseable JSON','/'+side+'/source');}
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||!Array.isArray(doc.modules))fail('TABLE_MIGRATION_OPTIONS','G03 '+side+' source must be a UMF document object','/'+side+'/source');
 const module=doc.modules?.[Number(match[1])],table=module?.extensions?.['umf.tables']?.tables?.[Number(match[2])],column=table?.columns?.[Number(match[3])];
 if(!module||typeof module!=='object'||!module.extensions||typeof module.extensions!=='object'||!table||typeof table!=='object'||!Array.isArray(table.columns)||!column||typeof column!=='object')fail('TABLE_MIGRATION_OPTIONS','G03 marker target does not exist in the '+side+' source','/options/reviewedChanges/0/path');
 if(typeof table.name!=='string'||typeof column.name!=='string')fail('TABLE_MIGRATION_OPTIONS','G03 target identifiers must be strings','/'+side+'/source'+marker.path);
 const fieldRef=column.field;
 if(!fieldRef||typeof fieldRef!=='object'||typeof fieldRef.module!=='string'||typeof fieldRef.element!=='string')fail('TABLE_MIGRATION_OPTIONS','G03 target must reference a Field by exact module and element','/'+side+'/source'+marker.path+'/field');
 const fieldModule=doc.modules.findIndex((item:any)=>item&&item.id===fieldRef.module),fieldElements=fieldModule>=0?doc.modules[fieldModule]?.elements:undefined;
 if(!Array.isArray(fieldElements))fail('TABLE_MIGRATION_OPTIONS','G03 target module must retain its element array','/'+side+'/source/modules/'+fieldModule+'/elements');
 const field=fieldElements.find((item:any)=>item?.id===fieldRef.element),fieldIndex=fieldElements.findIndex((item:any)=>item?.id===fieldRef.element);
 if(!field||field.kind!=='field')fail('TABLE_MIGRATION_OPTIONS','G03 native target must bind an existing Field','/options/reviewedChanges/0/path');
 const path='/'+side+'/source'+marker.path,logicalPath='/'+side+'/source/modules/'+fieldModule+'/elements/'+fieldIndex+'/default';
 if(Object.hasOwn(column,'default')){
  const d=column.default;
  if(!d||typeof d!=='object'||Array.isArray(d)||!['literal','currentTimestamp','randomUuid'].includes(d.kind))fail('TABLE_MIGRATION_UNSUPPORTED','G03 default must use the closed native default vocabulary',path);
  if(d.kind==='literal'){
   if(Object.keys(d).sort().join(',')!=='kind,value')fail('TABLE_MIGRATION_UNSUPPORTED','Unknown native literal-default qualifiers are not qualified',path);
   const literalPath=path+'/value',bytes=literalPayloadBytes(d.value,literalPath);
   if(bytes>1_048_576)fail('TABLES_NATIVE_CAPACITY','G03 decoded literal payload exceeds 1 MiB UTF-8',literalPath);
   validateRawNativeCapacity(column.nativeType,d.value,literalPath,path.replace(/\/default$/,'/nativeType'));
  }else if(Object.keys(d).length!==1)fail('TABLE_MIGRATION_UNSUPPORTED','Unknown native default qualifiers are not qualified',path);
 }
 if(field.default!==undefined){
  if(!field.default||typeof field.default!=='object'||Array.isArray(field.default)||Object.keys(field.default).sort().join(',')!=='on,value'||field.default.on!=='missing'||!Object.hasOwn(field.default,'value'))fail('TABLE_MIGRATION_UNSUPPORTED','G03 logical default must be a closed missing-only literal',logicalPath);
  const logicalValuePath=logicalPath+'/value',logicalBytes=literalPayloadBytes(field.default.value,logicalValuePath);
  if(logicalBytes>1_048_576)fail('TABLES_NATIVE_CAPACITY','G03 decoded logical default payload exceeds 1 MiB UTF-8',logicalValuePath);
 }
 let expressionBytes=0;
 if(Object.hasOwn(column,'default')){
  const d=column.default;
  expressionBytes=d.kind==='literal'?estimatedLiteralExpressionBytes(d.value,path+'/value'):
   d.kind==='currentTimestamp'?17:d.kind==='randomUuid'?new TextEncoder().encode('pg_catalog.gen_random_uuid()').length:0;
 }
 if(expressionBytes>1_048_576)fail('TABLES_NATIVE_CAPACITY','G03 rendered default expression exceeds 1 MiB UTF-8',path);
 const quoteBytes=(value:string,identifierPath:string)=>{if(value.length>1_049_600)fail('TABLES_NATIVE_CAPACITY','G03 identifier exceeds the bounded statement size',identifierPath);let bytes=2;for(const char of value){const code=char.codePointAt(0)!;bytes+=code<0x80?1:code<0x800?2:code<0x10000?3:4;if(char==='"')bytes++;}return bytes;};
 const setting=Object.hasOwn(column,'default')?' SET DEFAULT ':' DROP DEFAULT';
 const statementBytes=new TextEncoder().encode('ALTER TABLE ').length+quoteBytes(bundle.configuration.schema,'/'+side+'/configuration/schema')+1+quoteBytes(table.name,path+'/table/name')+new TextEncoder().encode(' ALTER COLUMN ').length+quoteBytes(column.name,path+'/column/name')+new TextEncoder().encode(setting).length+expressionBytes;
 if(statementBytes>1_049_600)fail('TABLES_NATIVE_CAPACITY','G03 ALTER statement exceeds 1,049,600 UTF-8 bytes',path);
 };
 inspect(previous,'previous',previousText);
 inspect(next,'next',nextText);
}

function estimatedLiteralExpressionBytes(value:any,path:string):number{
 if(value===null)return 4;
 if(value&&typeof value==='object'&&typeof value.boolean==='boolean')return value.boolean?4:5;
 if(!value||typeof value!=='object'||Object.keys(value).length!==1)fail('TABLES_NATIVE_CAPACITY','Invalid closed literal carrier',path);
 const key=Object.keys(value)[0]!,text=value[key];if(typeof text!=='string')fail('TABLES_NATIVE_CAPACITY','Literal carrier must be text',path+'/'+key);
 if(key==='string'){
  let bytes=0,extra=0;for(let i=0;i<text.length;i++){
   const c=text.charCodeAt(i);
   if(c>=0xd800&&c<=0xdbff){i++;bytes+=4;continue;}
   bytes+=c<0x80?1:c<0x800?2:3;if(c===0x5c||c===0x27)extra++;
  }
  return bytes+extra+new TextEncoder().encode("(E' '::pg_catalog.text COLLATE pg_catalog.\"C\")").length-1;
 }
 if(key==='integerToken'||key==='decimalToken')return numericRenderedLength(text,path+'/'+key)+new TextEncoder().encode("E''::pg_catalog.numeric").length;
 let prefix='',suffix='';
 if(key==='uuid'){prefix="E'";suffix="'::pg_catalog.uuid";}
 else if(key==='date'){prefix="E'";suffix="'::pg_catalog.date";}
 else if(key==='timestamp'){prefix="E'";suffix="'::pg_catalog.timestamptz";}
 else if(key==='binaryHex'||key==='bits128Hex'){prefix="pg_catalog.decode(E'";suffix="','hex')";}
 else fail('TABLES_NATIVE_CAPACITY','Unknown literal carrier',path+'/'+key);
 let extra=0;for(const char of text)if(char==='\\'||char==="'")extra++;
 return new TextEncoder().encode(prefix).length+new TextEncoder().encode(text).length+extra+new TextEncoder().encode(suffix).length;
}

function numericRenderedLength(token:string,path:string):number{
 const matchMaybe=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
 if(!matchMaybe||matchMaybe[0]!==token)fail('TABLES_NATIVE_CAPACITY','Exact numeric literal required',path);
 const match=matchMaybe!;
 const fraction=match[3]??'',digits=(match[2]!+fraction).replace(/^0+/,'' );if(!digits)return 1;
 if((match[4]??'0').length>32)fail('TABLES_NATIVE_CAPACITY','Numeric exponent exceeds the bounded exact grammar',path);
 const trimmed=digits.replace(/0+$/,''),exponent=BigInt(match[4]??'0')-BigInt(fraction.length)+BigInt(digits.length-trimmed.length);
 if(BigInt(trimmed.length)+exponent>131072n||exponent < -16383n)fail('TABLES_NATIVE_CAPACITY','Literal exceeds finite PostgreSQL numeric capacity',path);
 return (match[1]==='-'?1:0)+trimmed.length+(exponent===0n?0:1+exponent.toString().length);
}

function literalPayloadBytes(value:any,path:string):number{
 if(value===null||value&&typeof value==='object'&&typeof value.boolean==='boolean'&&Object.keys(value).length===1)return 0;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1)fail('TABLES_NATIVE_CAPACITY','Invalid closed literal carrier',path);
 const key=Object.keys(value)[0]!,carrier=value[key];
 if(typeof carrier!=='string')fail('TABLES_NATIVE_CAPACITY','Literal carrier must be text',path+'/'+key);
 let bytes=0;
 for(let i=0;i<carrier.length;i++){
  const code=carrier.charCodeAt(i);
  if(code===0)fail('TABLES_NATIVE_CAPACITY','PostgreSQL literal text cannot contain NUL',path+'/'+key);
  if(code>=0xd800&&code<=0xdbff){const low=carrier.charCodeAt(i+1);if(!(low>=0xdc00&&low<=0xdfff))fail('TABLES_NATIVE_CAPACITY','Unpaired UTF-16 surrogate is not admitted',path+'/'+key);bytes+=4;i++;}
  else if(code>=0xdc00&&code<=0xdfff)fail('TABLES_NATIVE_CAPACITY','Unpaired UTF-16 surrogate is not admitted',path+'/'+key);
  else bytes+=code<0x80?1:code<0x800?2:3;
  if(bytes>1_048_576)fail('TABLES_NATIVE_CAPACITY','G03 decoded literal payload exceeds 1 MiB UTF-8',path+'/'+key);
 }
 return bytes;
}

function validateRawNativeCapacity(type:any,value:any,path:string,nativeTypePath:string):void{
 if(type?.kind==='numeric'&&(
  !type||typeof type!=='object'||Array.isArray(type)||
  Object.keys(type).sort().join(',')!=='kind,precision,scale'||
  !Number.isSafeInteger(type.precision)||type.precision<1||type.precision>1000||
  !Number.isSafeInteger(type.scale)||type.scale<0||type.scale>type.precision
 ))fail('TABLES_NATIVE_CAPACITY','Numeric native type must have bounded integer precision and scale',nativeTypePath);
 if(value===null)return;
 if(type?.kind==='numeric'||['int2','int4','int8'].includes(type?.kind)){
  const token=value.integerToken??value.decimalToken;if(typeof token!=='string')return;
  const scale=type.kind==='numeric'?type.scale:0;
  if(['int2','int4','int8'].includes(type.kind)){
   const coefficient=boundedSignedInteger(token,type.kind==='int2'?16:type.kind==='int4'?32:64,path);
   if(coefficient===undefined)fail('TABLES_NATIVE_CAPACITY','Integer exceeds native signed width or is not integral',path);
   return;
  }
  assertCoefficientBudget(token,scale,type.precision,path);
  schemaCoefficient(token,scale,type.precision);
 }
}

function numericParts(token:string,path:string):{negative:boolean;whole:string;fraction:string;exponent:bigint}|undefined{
 const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
 if(!m||m[0]!==token)return fail('TABLES_NATIVE_CAPACITY','Exact numeric literal required',path);
 const match=m,exponentText=match[4]??'0';
 const rawDigits=match[2]!+(match[3]??'');let first=0;while(first<rawDigits.length&&rawDigits.charCodeAt(first)===48)first++;
 if(first===rawDigits.length)return {negative:match[1]==='-',whole:'0',fraction:'',exponent:0n};
 if(exponentText.length>32)fail('TABLES_NATIVE_CAPACITY','Numeric exponent exceeds the bounded exact grammar',path);
 return {negative:match[1]==='-',whole:match[2]!,fraction:match[3]??'',exponent:BigInt(exponentText)};
}

function assertCoefficientBudget(token:string,scale:number,precision:number,path:string):void{
 const parts=numericParts(token,path);if(!parts||parts.whole==='0'&&parts.fraction===''||parts.exponent===0n&&parts.whole==='0')return;
 const digits=parts.whole+parts.fraction;let leading=0;while(leading<digits.length&&digits.charCodeAt(leading)===48)leading++;
 const significant=digits.length-leading,shift=parts.exponent-BigInt(parts.fraction.length)+BigInt(scale);
 if(shift>=0n){if(BigInt(significant)+shift>BigInt(precision))fail('TABLES_NATIVE_CAPACITY','Numeric literal exceeds native precision',path);return;}
 const cut=-shift;if(cut>BigInt(significant))fail('TABLES_NATIVE_CAPACITY','Numeric literal exceeds native scale',path);
 const cutCount=Number(cut);for(let index=digits.length-cutCount;index<digits.length;index++)if(digits.charCodeAt(index)!==48)fail('TABLES_NATIVE_CAPACITY','Numeric literal exceeds native scale',path);
 if(significant-cutCount>precision)fail('TABLES_NATIVE_CAPACITY','Numeric literal exceeds native precision',path);
}

function boundedSignedInteger(token:string,bits:number,path:string):bigint|undefined{
 const parts=numericParts(token,path);if(!parts)return undefined;
 const digits=parts.whole+parts.fraction;let first=0;while(first<digits.length&&digits.charCodeAt(first)===48)first++;
 if(first===digits.length)return 0n;
 let last=digits.length;while(last>first&&digits.charCodeAt(last-1)===48)last--;
 const trailingZeros=digits.length-last,significant=digits.slice(first,last),decimalShift=parts.exponent-BigInt(parts.fraction.length)+BigInt(trailingZeros);
 let integerDigits:string;
 if(decimalShift>=0n){if(BigInt(significant.length)+decimalShift>BigInt(bits===64?19:bits===32?10:5))return undefined;integerDigits=significant+'0'.repeat(Number(decimalShift));}
 else{
  const cut=-decimalShift;if(cut>BigInt(significant.length))return undefined;
  const cutCount=Number(cut);for(let i=significant.length-cutCount;i<significant.length;i++)if(significant.charCodeAt(i)!==48)return undefined;
  const end=significant.length-cutCount;if(end<=0)return 0n;
  integerDigits=significant.slice(0,end);
 }
 if(integerDigits.length>(bits===64?19:bits===32?10:5))return undefined;
 const value=BigInt(integerDigits)*(parts.negative?-1n:1n),limit=1n<<BigInt(bits-1);
 return value>=-limit&&value<limit?value:undefined;
}
