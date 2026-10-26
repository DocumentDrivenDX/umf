// SPDX-License-Identifier: MIT OR Apache-2.0
import {canonical,hashCanonical,sha256Text} from '../compilation/bundle/hash';
import {readDocument} from '../model/document';
import {copyJson} from '../model/json';
import {UmfError} from '../model/types';
import type {TableDeploymentBundle} from '../table-deployment';
import type {TableMigrationPlan} from './index';
import type {MigrationReview} from './options';
import {discoverTableMigrationChanges as discoverLegacy,type ReviewedChangeCandidate,type ReviewedChangeMarker} from './reviewed';

export type G04RecipeKind='numeric-exact'|'numeric-rescale'|'text-date'|'date-text'|'text-instant'|'instant-text'|'date-instant'|'instant-date'|'text-uuid'|'uuid-text'|'text-boolean'|'boolean-text';
export type G04Recipe={version:'umf.conversion-recipe/0.1';kind:G04RecipeKind;parameters:Record<string,unknown>};
export type G04Recovery={mode:'irreversible';reviewMarker:string}|{mode:'retained-originals';policy:{id:string;revision:string}}|{mode:'round-trip';proofProfile:string};
export interface G04ConversionSelection {table:string;field:{module:string;element:string};recipe:G04Recipe;nulls:'preserve';invalid:'abort';recovery:G04Recovery}
export interface G04ReviewMarker {id:string;kind:ReviewedChangeMarker['kind']|'conversion-effects';path:string;oldDigest:string;newDigest:string}
export interface G04MigrationOptions {version:'umf.table-migration-options/0.7';backfills:[];concurrentIndexes:[];reviewedChanges:G04ReviewMarker[];validations:[];conversions:G04ConversionSelection[]}
export interface G04DiscoverySelector {version:'umf.table-migration-discovery/0.4';conversionIntents:unknown[]}
export type G04ReviewedCandidate=Omit<ReviewedChangeCandidate,'kind'|'conversion'>&{kind:ReviewedChangeCandidate['kind']|'conversion-effects'};
export interface G04ConversionStep {
 id:string;kind:'conversion';sourcePath:string;transaction:'required';sql:'';
 preconditions:{phase:'before-plan';kind:'installed-source-cohort';bundleDigest:string};
 expectedOutcome:{phase:'before-commit';kind:'complete-next-source-catalog';bundleDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction';
 operation:'capture-originals'|'convert-field'|'validate-conversion';phaseOperation:'capture-originals'|'convert-field'|'validate-conversion';
 phaseTarget:{table:string;field:{module:string;element:string}};
 conversionBinding:{profile:'umf.field-conversion-step/0.1';selectionIndex:number;intentDigest:string;beforeDomainDigest:string;afterDomainDigest:string};
}

const fail=(message:string,path='/options'):never=>{throw new UmfError('TABLE_MIGRATION_OPTIONS',message,path);};
const exact=(value:unknown,keys:readonly string[]):boolean=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const same=(a:unknown,b:unknown):boolean=>canonical(a)===canonical(b);
const refKey=(ref:{module:string;element:string}):string=>JSON.stringify([ref.module,ref.element]);
const kinds=new Set<G04RecipeKind>(['numeric-exact','numeric-rescale','text-date','date-text','text-instant','instant-text','date-instant','instant-date','text-uuid','uuid-text','text-boolean','boolean-text']);
const utf8Id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&!value.includes('\0')&&new TextEncoder().encode(value).length<=256;

export function g04DiscoveryIntent(selection:G04ConversionSelection):Record<string,unknown>{
 const {recovery,...rest}=selection;
 return {...rest,recovery:recovery.mode==='irreversible'?{mode:'irreversible'}:recovery};
}
type ConversionMeaning=Record<string,unknown>&{meaning:{physical:TableDeploymentBundle['expectedCatalog']['columns'][number];logical:any;mapping:any}};
function conversionMeaning(bundle:TableDeploymentBundle,tableId:string,field:{module:string;element:string},side:'previous'|'next',intent:unknown):ConversionMeaning{
 const table=bundle.expectedCatalog.tables.find(item=>item.id===tableId),physical=bundle.expectedCatalog.columns.find(item=>item.table===tableId&&refKey(item.field)===refKey(field));
 const mapping=table?.columns.find(item=>refKey(item.field)===refKey(field));
 const document=readDocument(bundle.source.utf8,bundle.source.format),logical=document.modules.find(module=>module.id===field.module)?.elements.find(element=>element.id===field.element);
 if(!table||!physical||!mapping||logical?.kind!=='field')fail('Conversion meaning is not bound to one existing physical and logical Field','/options/conversions');
 return {version:'umf.field-conversion-review/0.1',side,source:{format:'json',sha256:sha256Text(bundle.source.utf8)},configuration:bundle.configuration,table:tableId,field:{module:field.module,element:field.element},meaning:{physical,logical,mapping},conversionIntent:intent,effects:[]};
}
function effectsFor(selection:G04ConversionSelection,oldMeaning:any,newMeaning:any):string[]{
 const effects=['original-representation-replaced'],kind=selection.recipe.kind;
 if(kind==='numeric-exact'&&(oldMeaning.meaning.logical.scalarType==='decimal'||newMeaning.meaning.logical.scalarType==='decimal'))effects.push('lexical-scale-not-promised');
 if(kind==='numeric-rescale')effects.push('numeric-quantization');
 if(kind==='text-instant')effects.push('lexical-offset-and-fraction-spelling');
 if(kind==='instant-date'&&selection.recipe.parameters.time==='discard')effects.push('time-component');
 if(kind==='date-instant')effects.push('utc-midnight-assignment');
 if(['date-text','instant-text','uuid-text'].includes(kind))effects.push('canonical-text-spelling');
 if(kind==='text-boolean'||kind==='boolean-text')effects.push('explicit-boolean-token-mapping');
 return effects;
}
function domainKind(bundle:TableDeploymentBundle,table:string,field:{module:string;element:string}):{logical:any;mapping:any;physical:any}{
 const physical=bundle.expectedCatalog.columns.find(column=>column.table===table&&refKey(column.field)===refKey(field)),mapping=bundle.expectedCatalog.tables.find(item=>item.id===table)?.columns.find(column=>refKey(column.field)===refKey(field));
 const logical=readDocument(bundle.source.utf8,bundle.source.format).modules.find(module=>module.id===field.module)?.elements.find(element=>element.id===field.element);
 if(!physical||!mapping||logical?.kind!=='field')fail('Conversion domain does not resolve to one source-bound Field');
 return {logical,mapping,physical};
}
function nativeMatches(logical:string,native:any):boolean{
 const kind=native?.kind;
 if(logical==='integer')return ['int2','int4','int8'].includes(kind);
 if(logical==='decimal')return kind==='numeric';
 if(logical==='string')return ['text','varchar'].includes(kind);
 if(logical==='date')return kind==='date';
 if(logical==='timestamp')return kind==='timestamptz';
 if(logical==='uuid')return kind==='uuid';
 if(logical==='boolean')return kind==='boolean';
 return false;
}
function validateRecipe(selection:G04ConversionSelection,oldDomain:any,newDomain:any,path:string):void{
 const recipe=selection.recipe;
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||!exact(recipe,['version','kind','parameters'])||recipe.version!=='umf.conversion-recipe/0.1'||!kinds.has(recipe.kind)||!recipe.parameters||typeof recipe.parameters!=='object'||Array.isArray(recipe.parameters))fail('Unknown or malformed checked conversion recipe',path+'/recipe');
 const kind=recipe.kind,parameters=recipe.parameters;
 const parameterKeys=kind==='numeric-rescale'?['rounding']:kind==='date-instant'?['at','offset']:kind==='instant-date'?['time','offset']:kind==='text-boolean'||kind==='boolean-text'?['trueToken','falseToken']:[];
 if(!exact(parameters,parameterKeys))fail('Conversion recipe parameters are not the exact closed shape',path+'/recipe/parameters');
 if(kind==='numeric-rescale'&&!['half-even','toward-zero'].includes(String(parameters.rounding)))fail('Numeric rescale requires an explicit supported rounding rule',path+'/recipe/parameters/rounding');
 if(kind==='date-instant'&&(parameters.at!=='00:00:00'||parameters.offset!=='Z'))fail('Date to instant requires exact UTC midnight parameters',path+'/recipe/parameters');
 if(kind==='instant-date'&&(!['require-midnight','discard'].includes(String(parameters.time))||parameters.offset!=='Z'))fail('Instant to date requires exact UTC parameters',path+'/recipe/parameters');
 if(kind==='text-boolean'||kind==='boolean-text'){
  const yes=parameters.trueToken,no=parameters.falseToken;
  if(!utf8Id(yes)||!utf8Id(no)||yes===no||new TextEncoder().encode(yes).length>128||new TextEncoder().encode(no).length>128)fail('Boolean token mapping requires distinct bounded exact strings',path+'/recipe/parameters');
 }
 const from=oldDomain.logical.scalarType,to=newDomain.logical.scalarType;
 const pair:Record<G04RecipeKind,[string,string]>={
  'numeric-exact':['numeric','numeric'],'numeric-rescale':['decimal','decimal'],'text-date':['string','date'],'date-text':['date','string'],
  'text-instant':['string','timestamp'],'instant-text':['timestamp','string'],'date-instant':['date','timestamp'],'instant-date':['timestamp','date'],
  'text-uuid':['string','uuid'],'uuid-text':['uuid','string'],'text-boolean':['string','boolean'],'boolean-text':['boolean','string']
 };
 const [source,target]=pair[kind];
 if((source==='numeric'?!['integer','decimal'].includes(from):from!==source)||(target==='numeric'?!['integer','decimal'].includes(to):to!==target))fail('Recipe logical domains do not match the exact source and target Fields',path+'/recipe');
 if(!nativeMatches(from,oldDomain.mapping.nativeType)||!nativeMatches(to,newDomain.mapping.nativeType))fail('Recipe logical domains do not match supported native carriers',path+'/recipe');
 const oldLogical={...oldDomain.logical},newLogical={...newDomain.logical};delete oldLogical.scalarType;delete newLogical.scalarType;delete oldLogical.facets;delete newLogical.facets;
 if(!same(oldLogical,newLogical)||oldDomain.physical.nullable!==newDomain.physical.nullable||oldDomain.mapping.generated||newDomain.mapping.generated||oldDomain.mapping.immutable===true||newDomain.mapping.immutable===true)fail('G04 type changes must preserve Field and stored-column meaning outside the selected type facets',path);
 const oldMapping={...oldDomain.mapping},newMapping={...newDomain.mapping};delete oldMapping.nativeType;delete newMapping.nativeType;delete oldMapping.sourcePath;delete newMapping.sourcePath;
 if(!same(oldMapping,newMapping))fail('G04 may change only the selected native type and source path',path);
 if(kind==='numeric-rescale'&&(from!=='decimal'||to!=='decimal'||!Number.isSafeInteger(newDomain.logical.facets?.scale)))fail('Numeric rescale requires an explicit decimal target scale',path+'/recipe');
 if(selection.nulls!=='preserve'||selection.invalid!=='abort')fail('Conversion requires explicit preserve-null and abort-invalid policy',path);
}

function referencesField(value:unknown,field:{module:string;element:string},seen=new Set<object>()):boolean{
 if(!value||typeof value!=='object')return false;
 if(seen.has(value as object))return false;seen.add(value as object);
 if(!Array.isArray(value)&&Object.keys(value).length===2&&(value as any).module===field.module&&(value as any).element===field.element)return true;
 return Array.isArray(value)?value.some(item=>referencesField(item,field,seen)):Object.values(value).some(item=>referencesField(item,field,seen));
}
function recordKeyContains(bundle:TableDeploymentBundle,recordRef:any,keyId:string,field:{module:string;element:string}):boolean{
 const document=readDocument(bundle.source.utf8,bundle.source.format),record=document.modules.find(module=>module.id===recordRef?.module)?.elements.find(element=>element.kind==='record'&&element.id===recordRef?.element) as any;
 return !!record?.keys?.some((key:any)=>key.id===keyId&&referencesField(key.fields,field));
}
function refuseUnsupportedDependencyClosure(bundle:TableDeploymentBundle,selection:G04ConversionSelection):void{
 const document=readDocument(bundle.source.utf8,bundle.source.format),payload=document.modules.find(module=>module.id===bundle.module)?.extensions?.['umf.tables'] as any;
 const table=payload?.tables?.find((item:any)=>item.id===selection.table),column=bundle.expectedCatalog.columns.find(item=>item.table===selection.table&&refKey(item.field)===refKey(selection.field)),mapping=table?.columns?.find((item:any)=>refKey(item.field)===refKey(selection.field));
 if(!table||!column||!mapping)fail('Conversion target table/column binding is absent','/options/conversions');
 if(Object.hasOwn(mapping,'default'))fail('G04 first profile refuses fields with native defaults until a typed dependency phase is available','/options/conversions');
 const localIndex=table.indexes?.some((index:any)=>referencesField(index.fields,selection.field)||referencesField(index.include,selection.field));
 const localCheck=table.checks?.some((check:any)=>referencesField(check.expression,selection.field));
 const localForeignKey=table.foreignKeys?.some((foreignKey:any)=>referencesField(foreignKey.fields,selection.field));
 const localKey=(()=>{
  const record=document.modules.find(module=>module.id===table.record.module)?.elements.find(element=>element.kind==='record'&&element.id===table.record.element) as any;
  return !!record?.keys?.some((key:any)=>referencesField(key.fields,selection.field));
 })();
 const inboundForeignKey=payload.tables.some((candidate:any)=>candidate.foreignKeys?.some((foreignKey:any)=>refKey(foreignKey.target?.record)===refKey(table.record)&&typeof foreignKey.target?.key==='string'&&recordKeyContains(bundle,table.record,foreignKey.target.key,selection.field)));
 const policyDependency=payload.tables.some((candidate:any)=>referencesField(candidate.policy,selection.field));
 const operationDependency=(payload.commands??[]).some((operation:unknown)=>referencesField(operation,selection.field));
 if(localIndex||localCheck||localForeignKey||localKey||inboundForeignKey||policyDependency||operationDependency)fail('G04 first profile refuses conversion targets with dependent indexes, constraints, keys, policies or operations until typed dependency steps are available','/options/conversions');
}

function validateG04SourceDelta(previous:TableDeploymentBundle,next:TableDeploymentBundle,items:readonly G04ConversionSelection[]):void{
 const before=readDocument(previous.source.utf8,previous.source.format),after=readDocument(next.source.utf8,next.source.format);
 const oldTables=previous.expectedCatalog.tables,newTables=next.expectedCatalog.tables;
 if(!same(previous.configuration,next.configuration)||previous.module!==next.module||previous.profile!==next.profile||!same(previous.seedSets,next.seedSets)||!same(oldTables.map(item=>item.id),newTables.map(item=>item.id)))fail('G04 cannot change configuration, table identity/order or seed meaning','/next/source');
 const oldClone=copyJson(before) as any,newClone=copyJson(after) as any;
 for(const item of items){
  const oldField=oldClone.modules.find((module:any)=>module.id===item.field.module)?.elements.find((element:any)=>element.id===item.field.element),newField=newClone.modules.find((module:any)=>module.id===item.field.module)?.elements.find((element:any)=>element.id===item.field.element);
  if(!oldField||!newField||oldField.kind!=='field'||newField.kind!=='field')fail('G04 requires the same retained Field identity in both source documents');
  if(Object.hasOwn(oldField,'scalarType'))newField.scalarType=oldField.scalarType;else delete newField.scalarType;
  if(Object.hasOwn(oldField,'facets'))newField.facets=oldField.facets;else delete newField.facets;
  const oldTable=oldClone.modules.find((module:any)=>module.id===previous.module)?.extensions?.['umf.tables']?.tables?.find((table:any)=>table.id===item.table),newTable=newClone.modules.find((module:any)=>module.id===next.module)?.extensions?.['umf.tables']?.tables?.find((table:any)=>table.id===item.table);
  const oldMapping=oldTable?.columns?.find((column:any)=>refKey(column.field)===refKey(item.field)),newMapping=newTable?.columns?.find((column:any)=>refKey(column.field)===refKey(item.field));
  if(!oldMapping||!newMapping)fail('G04 target mapping is not retained');newMapping.nativeType=oldMapping.nativeType;
 }
 if(!same(oldClone,newClone))fail('G04 source may change only selected Field type facets and native mappings','/next/source');
 const oldCatalog=copyJson(previous.expectedCatalog) as any,newCatalog=copyJson(next.expectedCatalog) as any;
 for(const item of items){
  const oldTable=oldCatalog.tables.find((table:any)=>table.id===item.table),newTable=newCatalog.tables.find((table:any)=>table.id===item.table),oldMapping=oldTable?.columns.find((column:any)=>refKey(column.field)===refKey(item.field)),newMapping=newTable?.columns.find((column:any)=>refKey(column.field)===refKey(item.field));
  if(!oldMapping||!newMapping)fail('G04 target native mapping is absent');newMapping.nativeType=oldMapping.nativeType;
  const oldColumn=oldCatalog.columns.find((column:any)=>column.table===item.table&&refKey(column.field)===refKey(item.field)),newColumn=newCatalog.columns.find((column:any)=>column.table===item.table&&refKey(column.field)===refKey(item.field));
  if(!oldColumn||!newColumn)fail('G04 target native column is absent');
  for(const key of ['typeSchema','typeName','typeMod','definitionSql']){if(Object.hasOwn(oldColumn,key))newColumn[key]=oldColumn[key];else delete newColumn[key];}
 }
 if(!same(oldCatalog,newCatalog))fail('G04 physical source catalogs may change only selected native type definitions','/next/expectedCatalog');
}

/** Exact, cycle-free discovery 0.4. This is source metadata only; it never prepares a native converter. */
export function discoverG04TableMigrationChanges(previous:TableDeploymentBundle,next:TableDeploymentBundle,selector:G04DiscoverySelector):G04ReviewedCandidate[]{
 if(!exact(selector,['version','conversionIntents'])||selector.version!=='umf.table-migration-discovery/0.4'||!Array.isArray(selector.conversionIntents)||selector.conversionIntents.length<1||selector.conversionIntents.length>256)fail('Unknown G04 discovery selector');
 if(previous.source.format!=='json'||next.source.format!=='json')fail('G04 discovery requires exact JSON retained sources','/previous/source/format');
 const candidates=discoverLegacy(previous,next,{version:'umf.table-migration-discovery/0.3'}),result:G04ReviewedCandidate[]=candidates.map(candidate=>candidate as G04ReviewedCandidate),seen=new Set<string>();
 for(const [index,intent] of selector.conversionIntents.entries()){
  const path='/options/conversions/'+index;
  if(!intent||typeof intent!=='object'||Array.isArray(intent))fail('Conversion intent must be a closed object',path);
  const item=intent as G04ConversionSelection;
  if(!exact(item,['table','field','recipe','nulls','invalid','recovery'])||!utf8Id(item.table)||!exact(item.field,['module','element'])||!utf8Id(item.field.module)||!utf8Id(item.field.element)||!item.recovery||typeof item.recovery!=='object'||Array.isArray(item.recovery))fail('Conversion intent identity is not exact',path);
  const recovery=item.recovery as any;
  if(recovery.mode==='irreversible'?!exact(recovery,['mode']):recovery.mode==='retained-originals'?(!exact(recovery,['mode','policy'])||!exact(recovery.policy,['id','revision'])||!utf8Id(recovery.policy.id)||!utf8Id(recovery.policy.revision)):recovery.mode==='round-trip'?(!exact(recovery,['mode','proofProfile'])||recovery.proofProfile!=='umf.exact-integer-widening-roundtrip/0.1'):true)fail('Discovery recovery intent is not the exact cycle-free closed form',path+'/recovery');
  const identity=JSON.stringify([item.table,refKey(item.field)]);if(seen.has(identity))fail('Duplicate conversion selection',path);seen.add(identity);
  const oldDomain=domainKind(previous,item.table,item.field),newDomain=domainKind(next,item.table,item.field);validateRecipe(item,oldDomain,newDomain,path);
  if(same({typeSchema:oldDomain.physical.typeSchema,typeName:oldDomain.physical.typeName,typeMod:oldDomain.physical.typeMod},{typeSchema:newDomain.physical.typeSchema,typeName:newDomain.physical.typeName,typeMod:newDomain.physical.typeMod}))fail('A conversion intent must select an actual native type change',path);
  const old=conversionMeaning(previous,item.table,item.field,'previous',intent),fresh=conversionMeaning(next,item.table,item.field,'next',intent);
  const effects=effectsFor(item,old,fresh),oldValue={...old,effects},newValue={...fresh,effects},oldDigest=hashCanonical(oldValue),newDigest=hashCanonical(newValue),markerPath=fresh.meaning.physical.sourcePath;
  const kind='conversion-effects',id='review-'+hashCanonical([kind,markerPath,oldDigest,newDigest]).slice(0,24);
  result.push({id,kind,path:markerPath,oldDigest,newDigest,oldValue,newValue});
 }
 if(result.length>512||new TextEncoder().encode(canonical(result)).length>24_000_000)fail('G04 discovery exceeds its marker or retained-byte bound');
 return result;
}

export function normalizeG04MigrationOptions(value:unknown,previous:TableDeploymentBundle|null,next:TableDeploymentBundle):G04MigrationOptions{
 if(!exact(value,['version','backfills','concurrentIndexes','reviewedChanges','validations','conversions'])||(value as any).version!=='umf.table-migration-options/0.7')fail('Unknown G04 options profile or members');
 const options=value as G04MigrationOptions;
 const installed=previous??fail('G04 conversion requires an installed source cohort','/previous');
 if(installed.source.format!=='json'||next.source.format!=='json')fail('G04 conversion requires exact JSON source bytes','/previous/source/format');
 if(!Array.isArray(options.backfills)||options.backfills.length||!Array.isArray(options.concurrentIndexes)||options.concurrentIndexes.length||!Array.isArray(options.validations)||options.validations.length||!Array.isArray(options.reviewedChanges)||!Array.isArray(options.conversions)||options.conversions.length<1||options.conversions.length>256)fail('G04 selects one or more conversions and no backfills, indexes or deferred validations');
 const normalized=options.conversions.map((item,index)=>{
  const path='/options/conversions/'+index;
  if(!exact(item,['table','field','recipe','nulls','invalid','recovery'])||!utf8Id(item.table)||!exact(item.field,['module','element'])||!utf8Id(item.field.module)||!utf8Id(item.field.element)||!item.recovery||typeof item.recovery!=='object'||Array.isArray(item.recovery))fail('Conversion entry has unknown or missing members',path);
  const r=item.recovery as any;
  if(r.mode==='irreversible'){if(!exact(r,['mode','reviewMarker'])||!utf8Id(r.reviewMarker))fail('Irreversible recovery requires one exact review marker',path+'/recovery');}
  else if(r.mode==='retained-originals'){if(!exact(r,['mode','policy'])||!exact(r.policy,['id','revision'])||!utf8Id(r.policy.id)||!utf8Id(r.policy.revision))fail('Retained originals requires an exact policy identity and revision',path+'/recovery');}
  else if(r.mode==='round-trip'){if(!exact(r,['mode','proofProfile'])||r.proofProfile!=='umf.exact-integer-widening-roundtrip/0.1')fail('Unknown round-trip proof profile',path+'/recovery');}
  else fail('Unknown conversion recovery mode',path+'/recovery');
  if(!['preserve'].includes(item.nulls)||item.invalid!=='abort')fail('G04 requires preserve-null and abort-invalid policies',path);
  const old=domainKind(installed,item.table,item.field),fresh=domainKind(next,item.table,item.field);validateRecipe(item,old,fresh,path);
  return item;
 });
 if(!same(normalized,options.conversions))fail('G04 conversion entries are not canonical closed records');
 const selector={version:'umf.table-migration-discovery/0.4' as const,conversionIntents:normalized.map(g04DiscoveryIntent)};
 const candidates=discoverG04TableMigrationChanges(installed,next,selector),typeChanges=candidates.filter(candidate=>candidate.kind==='change-column-type'),effects=candidates.filter(candidate=>candidate.kind==='conversion-effects');
 if(candidates.some(candidate=>!['change-column-type','change-operation-context','conversion-effects'].includes(candidate.kind)))fail('G04 first profile refuses unimplemented changed dependencies or unselected source meaning','/next/source');
 if(typeChanges.length!==normalized.length||effects.length!==normalized.length)fail('Each and only each selected conversion must bind one existing type change and one effects marker');
 const selected=new Set(normalized.map(item=>JSON.stringify([item.table,refKey(item.field)])));
 for(const item of normalized){if(item.recovery.mode==='round-trip')fail('Round-trip recovery is unavailable until the target write-domain CHECK has a qualified installer and witness','/options/conversions');refuseUnsupportedDependencyClosure(next,item);}
 for(const candidate of typeChanges){
  const meaning=candidate.newValue as any,table=meaning?.physical?.table,field=meaning?.physical?.field;
  if(!selected.has(JSON.stringify([table,refKey(field)])))fail('Unselected Field type change is not admitted',candidate.path);
 }
 const markers=candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 if(options.reviewedChanges.some(marker=>(marker as any).conversion!==undefined)||!same(options.reviewedChanges,markers))fail('G04 review markers must be the exact ordered source discovery, without legacy conversion qualifiers','/options/reviewedChanges');
 for(const [index,item] of normalized.entries()){
  const recovery=item.recovery;
  if(recovery.mode==='irreversible'){
  const exactMarker=effects.find(candidate=>candidate.id===recovery.reviewMarker);
  const intent=(exactMarker?.oldValue as any)?.conversionIntent;
  if(!exactMarker||exactMarker.path!==domainKind(next,item.table,item.field).physical.sourcePath||intent?.table!==item.table||!intent?.field||refKey(intent.field)!==refKey(item.field))fail('Irreversible recovery must reference this conversion’s exact effects marker','/options/conversions/'+index+'/recovery/reviewMarker');
  }
 }
 validateG04SourceDelta(installed,next,normalized);
 return options;
}

export function compileG04ConversionPlan(request:{id:string;predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle;next:TableDeploymentBundle},options:G04MigrationOptions):TableMigrationPlan{
 const previous=request.previous,next=request.next,items=options.conversions,discovery=discoverG04TableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.4',conversionIntents:items.map(g04DiscoveryIntent)});
 const effects=discovery.filter(candidate=>candidate.kind==='conversion-effects'),domainBySelection=items.map(item=>({before:domainKind(previous,item.table,item.field),after:domainKind(next,item.table,item.field)}));
 const steps:G04ConversionStep[]=[],target=(item:G04ConversionSelection)=>({table:item.table,field:{...item.field}}),base=(selectionIndex:number,phaseOperation:G04ConversionStep['phaseOperation'],sourcePath:string)=>{
  const item=items[selectionIndex]!,domains=domainBySelection[selectionIndex]!,effect=effects[selectionIndex]!;
  return {id:'',kind:'conversion' as const,sourcePath,transaction:'required' as const,sql:'' as const,
   preconditions:{phase:'before-plan' as const,kind:'installed-source-cohort' as const,bundleDigest:previous.bundleDigest},
   expectedOutcome:{phase:'before-commit' as const,kind:'complete-next-source-catalog' as const,bundleDigest:next.bundleDigest},
   verification:'native-catalog-privileges-and-role-scope' as const,recovery:'rollback-transaction' as const,
   operation:phaseOperation,phaseOperation,phaseTarget:target(item),conversionBinding:{profile:'umf.field-conversion-step/0.1' as const,selectionIndex,intentDigest:hashCanonical(g04DiscoveryIntent(item)),beforeDomainDigest:hashCanonical({physical:domains.before.physical,logical:domains.before.logical,mapping:domains.before.mapping}),afterDomainDigest:hashCanonical({physical:domains.after.physical,logical:domains.after.logical,mapping:domains.after.mapping})}};
 };
 items.forEach((item,index)=>{if(item.recovery.mode==='retained-originals')steps.push(base(index,'capture-originals','/options/conversions/'+index+'/recovery'));});
 items.forEach((_item,index)=>steps.push(base(index,'convert-field','/options/conversions/'+index+'/recipe')));
 items.forEach((item,index)=>steps.push(base(index,'validate-conversion',domainBySelection[index]!.after.physical.sourcePath)));
 if(steps.length>99999)fail('G04 step identifiers exceed capacity','/steps');
 steps.forEach((step,index)=>{step.id='step-'+String(index+1).padStart(5,'0');});
 const phase:NonNullable<TableMigrationPlan['phases']>[number]={id:'phase-00001',kind:'field-conversion',transaction:'required',steps:steps.map(step=>step.id)};
 const review:MigrationReview[]=[];
 items.forEach((item,index)=>{if(item.recovery.mode==='irreversible')review.push({code:'IRREVERSIBLE_FIELD_CONVERSION',path:domainBySelection[index]!.after.physical.sourcePath,message:'Irreversible conversion from '+domainBySelection[index]!.before.logical.scalarType+' to '+domainBySelection[index]!.after.logical.scalarType+' loses original stored representation.'});});
 const body:Omit<TableMigrationPlan,'digest'>={version:'umf.table-migration/0.7',canonicalization:'RFC8785',id:request.id,predecessor:request.predecessor,previous,next,options,fromBundleDigest:previous.bundleDigest,toBundleDigest:next.bundleDigest,steps,seedExecution:'none',phases:[phase],executionProfile:{version:'umf.table-migration-execution/0.6',progressRelation:'umf_lifecycle_progress',ownerOnly:true,ingressProfile:'umf.table-generation-ingress/0.1',conversionProfile:'umf.checked-field-conversion/0.1',originalsProfile:items.some(item=>item.recovery.mode==='retained-originals')?'umf.pg-row-originals/0.1':null},approvalProfile:{version:'umf.table-migration-approval/0.1',relation:'umf_lifecycle_approvals',ownerOnly:true},review,requiresApproval:true,nativeQualified:false};
 if(new TextEncoder().encode(canonical(body)).length>24_000_000)fail('G04 migration plan exceeds 24MB');
 return {...body,digest:hashCanonical(body)};
}
