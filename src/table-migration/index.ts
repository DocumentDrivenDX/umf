// SPDX-License-Identifier: MIT OR Apache-2.0
import {migrationOptions,refKey,type LegacyTableMigrationOptions,type TableMigrationOptions,type MigrationReview} from './options';
export type {LegacyTableMigrationOptions,TableMigrationOptions} from './options';
import {copyJson} from '../model/json';
import {readDocument} from '../model/document';
import {UmfError,type Diagnostic} from '../model/types';
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {columnDefinitionSql,nativeType,typedDefaultExpressionSql} from '../table-deployment/sql';
import {verifyTableDeployment,type TableDeploymentBundle,type TableDeploymentStep} from '../table-deployment';
import {discoverTableMigrationChanges as discoverLegacyTableMigrationChanges,type ReviewedChangeCandidate,type ReviewedChangeKind} from './reviewed';
import {compileG04ConversionPlan,discoverG04TableMigrationChanges,type G04DiscoverySelector,type G04MigrationOptions,type G04ReviewedCandidate} from './g04-conversion';
import {phaseTableMigrationSteps,type TableMigrationPhase} from './phases';
import {preflightG03DefaultLiteral,validateG03DefaultChange} from './g03-defaults';
import {policySql} from '../table-deployment/policies';
import type {DeploymentContext} from '../table-deployment/types';
import type {TableMigrationExecutionProfile} from './phases-options';
import type {TableDeclaration,TableRef} from '../extensions/tables';
import {hasTableMigrationOperationCapture,TABLE_MIGRATION_OPERATION,tableMigrationFieldOperationTag,withTableMigrationOperation,type TableMigrationGrantRow,type TableMigrationOperationRole,type TableMigrationOperationTag} from './internal-operations';
import {renderG02FieldEffect} from './g02-field-effects';
import {deriveTableGrantEffectRow,renderTableGrantSql,type GrantBoundRecord} from '../table-deployment/grants';
export {reviewedValueDigest} from './reviewed';
export function discoverTableMigrationChanges(previous:TableDeploymentBundle,next:TableDeploymentBundle,selector:G04DiscoverySelector):G04ReviewedCandidate[];
export function discoverTableMigrationChanges(previous:TableDeploymentBundle,next:TableDeploymentBundle,selector?:{version:'umf.table-migration-discovery/0.2'|'umf.table-migration-discovery/0.3'}):ReviewedChangeCandidate[];
export function discoverTableMigrationChanges(previous:TableDeploymentBundle,next:TableDeploymentBundle,selector?:{version:'umf.table-migration-discovery/0.2'|'umf.table-migration-discovery/0.3'}|G04DiscoverySelector):ReviewedChangeCandidate[]|G04ReviewedCandidate[]{
 if(selector?.version==='umf.table-migration-discovery/0.4')return discoverG04TableMigrationChanges(previous,next,selector);
 return discoverLegacyTableMigrationChanges(previous,next,selector);
}
export type {ReviewedChangeCandidate,ReviewedChangeKind,ReviewedChangeMarker} from './reviewed';
export type {G04ConversionSelection,G04Recipe,G04RecipeKind,G04Recovery,G04MigrationOptions,G04DiscoverySelector,G04ReviewedCandidate,G04ReviewMarker} from './g04-conversion';

export interface TableMigrationRequest {
 id:string;predecessor:{id:string;digest:string}|null;
 previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options?:TableMigrationOptions;
}
export interface TableMigrationStep extends Omit<TableDeploymentStep,'transaction'|'kind'> {
 kind:TableDeploymentStep['kind']|'backfill'|'seed'|'conversion';transaction:'required'|'forbidden';operation?:string;constraintKind?:'check'|'foreignKey';seedSets?:string[];
 phaseOperation?:'backfill'|'tighten-not-null'|'add-column'|'target-check'|'install-default'|'change-default'|'drop-column'|'dependency-drop'|'dependency-add'|'capture-originals'|'convert-field'|'validate-conversion';phaseTarget?:{table:string;field:{module:string;element:string}};phaseDependency?:{table:string;kind:'check'|'foreignKey'|'index'|'key'|'policy'|'grant';id:string;sourcePath:string;meaningDigest:string};conversionBinding?:{profile:'umf.field-conversion-step/0.1';selectionIndex:number;intentDigest:string;beforeDomainDigest:string;afterDomainDigest:string};
 preconditions:{phase:'before-plan';kind:'empty-private-schema'|'installed-source-cohort';bundleDigest:string|null};
 expectedOutcome:{phase:'before-commit';kind:'complete-next-source-catalog';bundleDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction'|'inspect-index';
}
type LegacyPhaseOperation=Exclude<NonNullable<TableMigrationStep['phaseOperation']>,'capture-originals'|'convert-field'|'validate-conversion'>;
export type LegacyTableMigrationStep=Omit<TableMigrationStep,'kind'|'phaseOperation'> & {kind:Exclude<TableMigrationStep['kind'],'conversion'>;phaseOperation?:LegacyPhaseOperation};
type TableMigrationStepDraft=Omit<LegacyTableMigrationStep,'preconditions'|'expectedOutcome'|'verification'|'recovery'> & Partial<Pick<LegacyTableMigrationStep,'preconditions'|'expectedOutcome'|'verification'|'recovery'>>;
export interface TableMigrationPlan extends TableMigrationRequest {
 version:'umf.table-migration/0.1'|'umf.table-migration/0.2'|'umf.table-migration/0.3'|'umf.table-migration/0.4'|'umf.table-migration/0.5'|'umf.table-migration/0.6'|'umf.table-migration/0.7';canonicalization:'RFC8785';
 fromBundleDigest:string|null;toBundleDigest:string;
 steps:TableMigrationStep[];
 phases?:TableMigrationPhase[];executionProfile?:TableMigrationExecutionProfile;
 approvalProfile?:{version:'umf.table-migration-approval/0.1';relation:'umf_lifecycle_approvals';ownerOnly:true};
 seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};
 requiresApproval:true;nativeQualified:false;digest:string;review?:MigrationReview[];
}
export type TableMigrationResult={status:'compiled';plan:TableMigrationPlan;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
type LegacyMigrationVersion=Exclude<TableMigrationPlan['version'],'umf.table-migration/0.7'>;
export type LegacyTableMigrationPlan=Omit<TableMigrationPlan,'version'|'options'> & {version:LegacyMigrationVersion;options?:LegacyTableMigrationOptions};
export type G04TableMigrationPlan=Omit<TableMigrationPlan,'version'|'options'> & {version:'umf.table-migration/0.7';options:G04MigrationOptions};
export type LegacyTableMigrationResult={status:'compiled';plan:LegacyTableMigrationPlan;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
export type G04TableMigrationResult={status:'compiled';plan:G04TableMigrationPlan;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
const fail=(message:string,path=''):never=>{throw new UmfError('TABLE_MIGRATION_UNSUPPORTED',message,path);};
const same=(a:unknown,b:unknown):boolean=>canonical(a)===canonical(b);
function internalFieldEffect(step:TableMigrationStepDraft,role:TableMigrationOperationRole,target:NonNullable<TableMigrationStep['phaseTarget']>,rowOperationId?:string):TableMigrationStepDraft{
 return withTableMigrationOperation({...step},tableMigrationFieldOperationTag(role,step.sourcePath,target.table,target.field,rowOperationId));
}
function internalDependencyEffect(step:TableMigrationStepDraft,role:TableMigrationOperationRole,subject:NonNullable<TableMigrationStep['phaseDependency']>):TableMigrationStepDraft{
 return withTableMigrationOperation({...step},{profile:'umf.table-migration-renderer-operation/0.1',role,sourcePath:step.sourcePath,subject:{type:'dependency',...subject}});
}
function g11GrantRows(bundle:TableDeploymentBundle,tableId:string,sourcePath:string):TableMigrationGrantRow[]{
 const match=/\/policy\/(person|batch)\/(select|insert|update|delete)$/.exec(sourcePath);if(!match)fail('G11 grant group requires an exact policy declaration path',sourcePath);
 const audience=match![1] as PolicyAudience,command=match![2] as PolicyCommand,table=bundle.expectedCatalog.tables.find(item=>item.id===tableId)??fail('G11 grant table is absent from the deployment bundle',sourcePath);
 const document=readDocument(bundle.source.utf8,bundle.source.format),moduleIndex=document.modules.findIndex(module=>module.id===bundle.module),module=document.modules[moduleIndex],payload=module?.extensions?.['umf.tables'] as {tables?:TableDeclaration[]}|undefined;
 const tableIndexes=payload?.tables?.map((candidate,index)=>candidate.id===tableId?index:-1).filter(index=>index>=0)??[];
 if(moduleIndex<0||tableIndexes.length!==1||!same(payload!.tables![tableIndexes[0]!]!,table))fail('G11 grant table is not bound to the complete original source declaration',sourcePath);
 const expectedPath=`/modules/${moduleIndex}/extensions/umf.tables/tables/${tableIndexes[0]}/policy/${audience}/${command}`;
 if(sourcePath!==expectedPath)fail('G11 grant source path is not the exact original policy declaration',sourcePath);
 const recordModule=document.modules.find(candidate=>candidate.id===table.record.module),record=recordModule?.elements.find(element=>element.kind==='record'&&element.id===table.record.element);
 if(!record||record.kind!=='record')fail('G11 grant cannot be derived without the exact source Record Keys',sourcePath);
 if(table.policy[audience][command].kind==='deny')return [];
 let row:TableMigrationGrantRow;
 try{row=deriveTableGrantEffectRow({table,recordModule:table.record.module,record:record as GrantBoundRecord,schema:bundle.configuration.schema,role:audience==='person'?bundle.configuration.personRole:bundle.configuration.batchRole,audience,command});}
 catch(error){if(error instanceof Error&&error.message==='TABLE_GRANT_EMPTY_UPDATE')fail('G11 cannot bind an empty UPDATE grant',sourcePath);throw error;}
 const rendered=bundle.steps.filter(step=>step.kind==='grant'&&step.sourcePath===sourcePath);
 if(rendered.length!==1||rendered[0]!.sql!==renderTableGrantSql(row,'grant'))fail('G11 grant source must match exactly one original typed renderer operation',sourcePath);
 return [row];
}
function internalGrantEffect(step:TableMigrationStepDraft,role:'grant-add'|'grant-revoke',bundle:TableDeploymentBundle,table:string,sourcePath:string):TableMigrationStepDraft{
 const rows=g11GrantRows(bundle,table,sourcePath);if(rows.length!==1)fail('G11 grant renderer source does not correspond to exactly one typed grant row',sourcePath);
 const meaningDigest=hashCanonical({version:'umf.table-migration-grant-group/0.1',rows});
 const rendererStep=bundle.steps.find(candidate=>candidate.kind==='grant'&&candidate.sourcePath===sourcePath)!;
 return withTableMigrationOperation({...step},{profile:'umf.table-migration-renderer-operation/0.1',role,sourcePath,subject:{type:'grant-group',table,sourcePath,rendererStepId:rendererStep.id,rows,meaningDigest,...(step.phaseDependency?{dependencyMeaningDigest:step.phaseDependency.meaningDigest}:{})}});
}
function internalPolicyEffect(step:TableMigrationStepDraft,previous:TableDeploymentBundle,next:TableDeploymentBundle,table:string,sourcePath:string):TableMigrationStepDraft{
 const before=g11DependencySubject(previous,table,'policy','',sourcePath),after=g11DependencySubject(next,table,'policy','',sourcePath);
 return withTableMigrationOperation({...step},{profile:'umf.table-migration-renderer-operation/0.1',role:'policy-alter',sourcePath,subject:{type:'policy-transition',table,sourcePath,beforeMeaningDigest:before.meaningDigest,afterMeaningDigest:after.meaningDigest}});
}
function without(value:object,keys:string[]):Record<string,unknown>{
 return Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
}
function withoutSourcePaths<T>(values:readonly T[]):unknown[]{
 return values.map(value=>value&&typeof value==='object'&&!Array.isArray(value)?without(value as object,['sourcePath']):value);
}
function commandOnly(previous:TableDeploymentBundle,next:TableDeploymentBundle):boolean{
 const documents=[previous,next].map(bundle=>readDocument(bundle.source.utf8,bundle.source.format));
 for(const document of documents){
  const module=document.modules.find(m=>m.id===previous.module)!;
  const payload=module.extensions!['umf.tables'] as {commands:unknown[];seedSets:unknown[]};payload.commands=[];payload.seedSets=[];
 }
 return same(documents[0],documents[1]);
}
function identity(value:unknown,path:string):asserts value is string{
 if(typeof value!=='string'||!value.length||value.includes('\0')||new TextEncoder().encode(value).length>256)fail('Expected a nonempty migration identity of at most256 UTF-8 bytes',path);
}
type G11DependencyKind='check'|'foreignKey'|'index'|'key'|'policy'|'grant';
function g11DependencySubject(bundle:TableDeploymentBundle,tableId:string,kind:G11DependencyKind,id:string,sourcePath:string):NonNullable<TableMigrationStep['phaseDependency']>{
 const table=bundle.expectedCatalog.tables.find(item=>item.id===tableId)??fail('G11 dependency table is absent from the source bundle',sourcePath);
 const relation={table:table.id,record:table.record,schema:bundle.configuration.schema,name:table.name};
 const document=readDocument(bundle.source.utf8,bundle.source.format),payload=document.modules.find(module=>module.id===bundle.module)?.extensions?.['umf.tables'] as any;
 let meaning:unknown;
 if(kind==='policy'||kind==='grant'){
  const match=/\/policy\/(person|batch)\/(select|insert|update|delete)$/.exec(sourcePath);if(!match)fail('G11 policy/grant subject needs an exact policy source pointer',sourcePath);
  const audience=match![1] as 'person'|'batch',command=match![2] as 'select'|'insert'|'update'|'delete',rule=table.policy[audience][command];
  if(kind==='grant'&&rule.kind==='deny')fail('A denied policy cannot yield a grant dependency subject',sourcePath);
  const ctx:DeploymentContext={document,payload,configuration:bundle.configuration,path:'/modules/'+document.modules.findIndex(module=>module.id===bundle.module)+'/extensions/umf.tables',steps:[],
   field(ref){const field=document.modules.find(module=>module.id===ref.module)?.elements.find(element=>element.id===ref.element);if(!field||field.kind!=='field')return fail('G11 policy references an absent Field',sourcePath);return field;},
   table(ref){return payload.tables.find((candidate:any)=>candidate.record.module===ref.module&&candidate.record.element===ref.element)??fail('G11 policy references an absent table',sourcePath);},
   column(target,ref){return target.columns.find((column:any)=>column.field.module===ref.module&&column.field.element===ref.element)?.name??fail('G11 policy references an unmapped Field',sourcePath);},
   relation(target){return quoteIdentifier(bundle.configuration.schema)+'.'+quoteIdentifier(target.name);},
   add(){fail('G11 policy subject rendering must remain pure',sourcePath);}
  };
  const expression=policySql(rule,table,ctx,audience,sourcePath),usingSql=command==='insert'?null:expression,withCheckSql=command==='insert'||command==='update'?expression:null;
  if(kind==='policy')meaning={audience,command,name:'umf_'+audience+'_'+command,role:audience==='person'?bundle.configuration.personRole:bundle.configuration.batchRole,permissive:true,rule,usingSql,withCheckSql};
  else{
   const record=document.modules.find(module=>module.id===table.record.module)?.elements.find(element=>element.id===table.record.element) as any;
   const mutable=table.columns.filter(column=>column.immutable!==true&&!column.generated&&!record.keys.some((key:any)=>key.fields.some((field:any)=>field.module===column.field.module&&field.element===column.field.element)));
   meaning={audience,command,role:audience==='person'?bundle.configuration.personRole:bundle.configuration.batchRole,columns:command==='update'?mutable.map(column=>({field:column.field,name:column.name})):null,grantOption:false};
   if(command==='update'&&!mutable.length)fail('G11 cannot bind an empty UPDATE grant',sourcePath);
  }
 }else{
  const physicalList=kind==='check'?bundle.expectedCatalog.checks:kind==='foreignKey'?bundle.expectedCatalog.foreignKeys:kind==='index'?bundle.expectedCatalog.indexes:bundle.expectedCatalog.keys;
  const physical=(physicalList as any[]).find(item=>item.table===tableId&&item.id===id)??fail('G11 native dependency expectation is absent',sourcePath);
  const module=document.modules.find(item=>item.id===table.record.module),record=module?.elements.find(item=>item.kind==='record'&&item.id===table.record.element) as any;
  let logical:unknown;
  if(kind==='key')logical=record?.keys?.find((item:any)=>item.id===id);
  else if(kind==='check')logical=table.checks.find(item=>item.id===id)??(()=>{const column=table.columns.find(item=>'domain:'+item.field.module+'.'+item.field.element===id);if(!column)return;const fieldModule=document.modules.find(item=>item.id===column.field.module),field=fieldModule?.elements.find(item=>item.kind==='field'&&item.id===column.field.element);return {column,field};})();
  else if(kind==='foreignKey')logical=table.foreignKeys.find(item=>item.id===id);
  else logical=table.indexes.find(item=>item.id===id);
  if(!logical)fail('G11 native dependency declaration is absent',sourcePath);
  meaning={physical,logical};
 }
 const subject={version:'umf.table-native-subject/0.1',kind,relation,meaning},digest=hashCanonical(subject);
 return {table:tableId,kind,id:kind==='policy'||kind==='grant'?'dependency-'+digest:id,sourcePath,meaningDigest:digest};
}
function g11DependencyPath(bundle:TableDeploymentBundle,tableId:string,kind:G11DependencyKind,id:string):string{
 const doc=readDocument(bundle.source.utf8,bundle.source.format),moduleIndex=doc.modules.findIndex(module=>module.id===bundle.module),module=doc.modules[moduleIndex]??fail('G11 dependency source location is absent','/next/source'),tableIndex=bundle.expectedCatalog.tables.findIndex(table=>table.id===tableId),table=bundle.expectedCatalog.tables[tableIndex]??fail('G11 dependency source location is absent: '+kind+' '+tableId+' '+id,'/next/source');
 if(kind==='policy'||kind==='grant'){
  const match=/^dependency-[a-f0-9]{64}$/.test(id)?undefined:id;
  void match;fail('G11 policy/grant locations must be supplied by their explicit declaration path','/next/source');
 }
 if(kind==='key'){
  const record=module.elements.find(item=>item.kind==='record'&&item.id===table.record.element) as any,index=(record?.keys??[]).findIndex((item:any)=>item.id===id);
  if(index<0)fail('G11 Key source location is absent','/next/source');
  return '/modules/'+moduleIndex+'/elements/'+module.elements.indexOf(record)+'/keys/'+index;
 }
 if(kind==='check'&&id.startsWith('domain:')){
  const column=bundle.expectedCatalog.columns.find(item=>item.table===tableId&&'domain:'+item.field.module+'.'+item.field.element===id);
  if(!column)return fail('G11 generated domain CHECK source location is absent','/next/source');
  return column.sourcePath+'/domain';
 }
 const property=kind==='foreignKey'?'foreignKeys':kind==='index'?'indexes':'checks',index=(table as any)[property].findIndex((item:any)=>item.id===id);
 if(index<0)fail('G11 dependency source location is absent: '+kind+' '+tableId+' '+id,'/next/source');
 return '/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/'+property+'/'+index;
}
function g11DependencyRefs(bundle:TableDeploymentBundle,dependency:NonNullable<TableMigrationStep['phaseDependency']>):{table:string;field:TableRef}[]{
 const parts=dependency.sourcePath.split('/').slice(1),doc=readDocument(bundle.source.utf8,bundle.source.format);let value:any=doc;
 for(const part of parts){const key=part.replaceAll('~1','/').replaceAll('~0','~');value=value?.[/^\d+$/.test(key)?Number(key):key];}
 const payload=doc.modules.find(module=>module.id===bundle.module)?.extensions?.['umf.tables'] as any,refs=new Map<string,{table:string;field:TableRef}>(),columns=bundle.expectedCatalog.columns;
 const add=(table:string,field:unknown):void=>{if(!field||typeof field!=='object')return;const candidate=field as TableRef;if(typeof candidate.module!=='string'||typeof candidate.element!=='string'||!columns.some(column=>column.table===table&&refKey(column.field)===refKey(candidate)))return;refs.set(table+'/'+refKey(candidate),{table,field:{module:candidate.module,element:candidate.element}});};
 const tableForRecord=(record:unknown):TableDeclaration|undefined=>{if(!record||typeof record!=='object')return;const ref=record as TableRef;return payload?.tables?.find((table:TableDeclaration)=>refKey(table.record)===refKey(ref));};
 const targetKey=(recordRef:unknown,keyId:unknown):{table:TableDeclaration;fields:TableRef[]}|undefined=>{if(typeof keyId!=='string')return;const table=tableForRecord(recordRef);if(!table)return;const ref=recordRef as TableRef,record=doc.modules.find(module=>module.id===ref.module)?.elements.find(element=>element.kind==='record'&&element.id===ref.element) as any,key=record?.keys?.find((item:any)=>item.id===keyId);return key?{table,fields:key.fields}:undefined;};
 const expression=(node:any,table:string):void=>{if(!node||typeof node!=='object')return;switch(node.op){case'field':add(table,node.field);break;case'literal':break;case'eq':case'ne':case'lt':case'le':case'gt':case'ge':expression(node.left,table);expression(node.right,table);break;case'and':case'or':for(const child of node.args??[])expression(child,table);break;case'not':case'isNull':expression(node.arg,table);break;case'in':expression(node.arg,table);break;default:fail('G11 dependency expression has an unsupported typed operator',dependency.sourcePath);}};
 const policyRule=(rule:any,current:string):void=>{
  if(!rule||typeof rule!=='object')return;
  switch(rule.kind){
   case'allow':case'deny':case'memberOfRole':break;
   case'owner':case'memberOf':add(current,rule.field);break;
   case'any':case'all':for(const child of rule.rules??[])policyRule(child,current);break;
   case'related':for(const match of rule.matches??[]){add(current,match.source);const related=tableForRecord(rule.record);if(related)add(related.id,match.target);}policyRule(rule.rule,tableForRecord(rule.record)?.id??current);break;
   case'via':{
    let currentRecord=(payload?.tables?.find((table:any)=>table.id===current) as TableDeclaration|undefined)?.record;
    if(!currentRecord)fail('G11 via policy has no current Record',dependency.sourcePath);
    for(const step of rule.path??[]){
     const relationship=doc.modules.find(module=>module.id===step.module)?.relationships?.find(item=>item.id===step.id);
     if(!relationship||step.module!==bundle.module||relationship.source?.length!==1||relationship.target?.length!==1)fail('G11 policy dependency has an unresolved typed relationship',dependency.sourcePath);
     const from=(step.direction==='forward'?relationship!.source[0]:relationship!.target[0])!,to=(step.direction==='forward'?relationship!.target[0]:relationship!.source[0])!;
     if(refKey(from)!==refKey(currentRecord!))fail('G11 via relationship does not continue from the current Record',dependency.sourcePath);
     const bindings=(payload?.tables??[]).flatMap((table:any)=>(table.foreignKeys??[]).filter((foreignKey:any)=>foreignKey.relationship?.module===step.module&&foreignKey.relationship?.id===step.id).map((foreignKey:any)=>({table,foreignKey})));
     if(bindings.length!==1)fail('G11 via relationship requires exactly one native ForeignKey binding',dependency.sourcePath);
     const binding=bindings[0]!,bindingSource=tableForRecord(relationship!.source[0]),bindingTarget=tableForRecord(relationship!.target[0]);
     if(!bindingSource||!bindingTarget||binding.table.id!==bindingSource.id||refKey(binding.foreignKey.target.record)!==refKey(bindingTarget.record))fail('G11 via ForeignKey binding disagrees with the typed relationship direction',dependency.sourcePath);
     for(const field of binding.foreignKey.fields)add(binding.table.id,field);
     const target=targetKey(binding.foreignKey.target.record,binding.foreignKey.target.key);if(!target)fail('G11 via ForeignKey target Key is unresolved',dependency.sourcePath);
     for(const field of target!.fields)add(target!.table.id,field);currentRecord=to;
    }
    const finalTable=tableForRecord(currentRecord);if(!finalTable)fail('G11 via path ends at an unresolved table',dependency.sourcePath);policyRule(rule.rule,finalTable!.id);break;
   }
   default:fail('G11 policy dependency has an unsupported typed rule',dependency.sourcePath);
  }
 };
 if(dependency.kind==='check'){
  if(value?.expression)expression(value.expression,dependency.table);
  else if(typeof dependency.id==='string'&&dependency.id.startsWith('domain:'))for(const expectedColumn of columns.filter(item=>item.table===dependency.table&&'domain:'+item.field.module+'.'+item.field.element===dependency.id))add(dependency.table,expectedColumn.field);
 }else if(dependency.kind==='key'){
  for(const field of value?.fields??[])add(dependency.table,field);
 }else if(dependency.kind==='index'){
  for(const field of value?.fields??[])add(dependency.table,field);for(const field of value?.include??[])add(dependency.table,field);
 }else if(dependency.kind==='foreignKey'){
  for(const field of value?.fields??[])add(dependency.table,field);const target=targetKey(value?.target?.record,value?.target?.key);if(target)for(const field of target.fields)add(target.table.id,field);
 }else if(dependency.kind==='policy'){
  const match=/\/policy\/(person|batch)\/(select|insert|update|delete)$/.exec(dependency.sourcePath),table=payload?.tables?.find((item:any)=>item.id===dependency.table);if(match&&table)policyRule(table.policy[match[1] as 'person'|'batch'][match[2] as PolicyCommand],dependency.table);
 }else if(dependency.kind==='grant'){
  if(dependency.sourcePath.endsWith('/update')){const grantTable=payload?.tables?.find((item:any)=>item.id===dependency.table),record=grantTable&&doc.modules.find(module=>module.id===grantTable.record.module)?.elements.find(element=>element.kind==='record'&&element.id===grantTable.record.element) as any;for(const column of grantTable?.columns??[])if(column.immutable!==true&&!column.generated&&!record?.keys?.some((key:any)=>key.fields.some((field:TableRef)=>refKey(field)===refKey(column.field))))add(dependency.table,column.field);}
 }
 return [...refs.values()];
}
type PolicyAudience='person'|'batch';
type PolicyCommand='select'|'insert'|'update'|'delete';
type GrantChange={previous:TableDeploymentBundle['steps'];next:TableDeploymentBundle['steps']};
type ColumnPair={old:TableDeploymentBundle['expectedCatalog']['columns'][number];fresh:TableDeploymentBundle['expectedCatalog']['columns'][number]};
type IndexEvolution={drops:TableDeploymentBundle['expectedCatalog']['indexes'];replacements:Set<string>};
type KeyEvolution={drops:TableDeploymentBundle['expectedCatalog']['keys'];adds:TableDeploymentBundle['expectedCatalog']['keys']};
type ForeignKeyEvolution={drops:TableDeploymentBundle['expectedCatalog']['foreignKeys'];replacements:Set<string>};
type MigrationChanges={policyChanges:Set<string>;columnChanges:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;droppedColumns:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;renamedColumns:Map<number,ColumnPair[]>;notNullColumns:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;relaxNullColumns:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;typeChanges:Map<number,ColumnPair[]>;indexChanges:Map<number,IndexEvolution>;keyChanges:Map<number,KeyEvolution>;foreignKeyChanges:Map<number,ForeignKeyEvolution>;checkChanges:Map<number,TableDeploymentBundle['expectedCatalog']['checks']>;droppedChecks:Map<number,TableDeploymentBundle['expectedCatalog']['checks']>;checkPaths:Map<number,Map<string,string>>;grantChanges:Map<string,GrantChange>};
function reviewedMatch(markers:NonNullable<LegacyTableMigrationOptions['reviewedChanges']>,previous:TableDeploymentBundle,next:TableDeploymentBundle,kind:string,path:string,conversion?:string,discoveryVersion?:'umf.table-migration-discovery/0.3'):boolean{
 const marker=markers.find(item=>item.path===path&&(item as any).kind===kind&&(conversion===undefined||(item as any).conversion===conversion));
 if(!marker)return false;
 const candidate=discoverTableMigrationChanges(previous,next,discoveryVersion?{version:discoveryVersion}:undefined).find(item=>item.kind===kind&&item.path===path);
 if(!candidate)return false;
 return !!candidate&&marker.oldDigest===candidate.oldDigest&&marker.newDigest===candidate.newDigest;
}
const quoteIdentifier=(value:string):string=>'"'+value.replaceAll('"','""')+'"';
function safeWidening(oldType:unknown,newType:unknown):boolean{
 const a=oldType as any,b=newType as any;if(!a||!b||typeof a.kind!=='string'||typeof b.kind!=='string')return false;
 if(a.kind==='int2'&&b.kind==='int4'||a.kind==='int4'&&b.kind==='int8')return true;
 if(a.kind==='numeric'&&b.kind==='numeric')return b.precision>=a.precision&&b.scale>=a.scale&&b.precision-b.scale>=a.precision-a.scale;
 return false;
}
function policyPath(moduleIndex:number,tableIndex:number,audience:PolicyAudience,command:PolicyCommand):string{
 return '/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/policy/'+audience+'/'+command;
}
function alterPolicySql(step:TableDeploymentBundle['steps'][number],table:TableDeploymentBundle['expectedCatalog']['tables'][number],configuration:TableDeploymentBundle['configuration'],audience:PolicyAudience,command:PolicyCommand):string{
 const name='umf_'+audience+'_'+command,role=audience==='person'?configuration.personRole:configuration.batchRole;
 const relation=quoteIdentifier(configuration.schema)+'.'+quoteIdentifier(table.name);
 const prefix='CREATE POLICY '+quoteIdentifier(name)+' ON '+relation+' AS PERMISSIVE FOR '+command.toUpperCase()+' TO '+quoteIdentifier(role);
 if(!step.sql.startsWith(prefix))fail('The policy compiler emitted an unexpected ALTER-compatible shape',step.sourcePath);
 const clauses=step.sql.slice(prefix.length);
 if(!clauses)fail('The policy compiler emitted no predicate clauses',step.sourcePath);
 return 'ALTER POLICY '+quoteIdentifier(name)+' ON '+relation+clauses;
}
function revokeGrantSql(step:TableDeploymentBundle['steps'][number],table:TableDeploymentBundle['expectedCatalog']['tables'][number],configuration:TableDeploymentBundle['configuration'],audience:PolicyAudience):string{
 const role=audience==='person'?configuration.personRole:configuration.batchRole;
 const relation=quoteIdentifier(configuration.schema)+'.'+quoteIdentifier(table.name);
 const suffix=' ON TABLE '+relation+' TO '+quoteIdentifier(role);
 if(!step.sql.startsWith('GRANT ')||!step.sql.endsWith(suffix))fail('The grant compiler emitted an unexpected revoke-compatible shape',step.sourcePath);
 const privilege=step.sql.slice('GRANT '.length,-suffix.length);
 if(!privilege)fail('The grant compiler emitted an empty privilege',step.sourcePath);
 return 'REVOKE '+privilege+' ON TABLE '+relation+' FROM '+quoteIdentifier(role);
}
function g11RevokeGrantSql(bundle:TableDeploymentBundle,tableId:string,sourcePath:string):string{
 const row=g11GrantRows(bundle,tableId,sourcePath)[0];if(!row)fail('G11 cannot revoke a grant absent from the typed policy',sourcePath);
 return renderTableGrantSql(row!,'revoke');
}
function g11ForeignKeyTarget(bundle:TableDeploymentBundle,tableId:string,foreignKeyId:string):{table:string;key:string}|undefined{
 const doc=readDocument(bundle.source.utf8,bundle.source.format),payload=doc.modules.find(module=>module.id===bundle.module)?.extensions?.['umf.tables'] as any,table=payload?.tables?.find((item:any)=>item.id===tableId),foreignKey=table?.foreignKeys?.find((item:any)=>item.id===foreignKeyId);if(!foreignKey)return;
 const target=payload?.tables?.find((item:any)=>refKey(item.record)===refKey(foreignKey.target.record));return target?{table:target.id,key:foreignKey.target.key}:undefined;
}
function g11KeyChangeHasMarker(bundle:TableDeploymentBundle,tableId:string,keyId:string,candidates:readonly ReviewedChangeCandidate[]):boolean{
 const sourcePath=g11DependencyPath(bundle,tableId,'key',keyId);return candidates.some(candidate=>candidate.kind==='replace-primary-key'&&candidate.oldPath===sourcePath);
}
function g11PhaseSteps(steps:LegacyTableMigrationStep[],previous:TableDeploymentBundle,next:TableDeploymentBundle,options:LegacyTableMigrationOptions):LegacyTableMigrationStep[]{
 void options;
 const ordered=[...steps];
 for(const step of ordered){
  if(!step.phaseOperation||Boolean(step.phaseTarget)===Boolean(step.phaseDependency))fail('G11 effect lacks exactly one compiler-typed subject and role',step.sourcePath);
  if(step.transaction!=='required')fail('G11 effects require one atomic transaction',step.sourcePath);
  const dependency=step.phaseOperation==='dependency-drop'||step.phaseOperation==='dependency-add';
  if(dependency!==Boolean(step.phaseDependency))fail('G11 dependency role/subject mismatch',step.sourcePath);
 }
 // Build only contract-stated edges. Unrelated effects retain authored planner
 // order; display names and broad role ranks never determine execution order.
 const edges=ordered.map(()=>new Set<number>()),indegree=ordered.map(()=>0);
 const addEdge=(before:number,after:number)=>{if(before!==after&&!edges[before]!.has(after)){edges[before]!.add(after);indegree[after]!++;}};
 const sameTarget=(a:LegacyTableMigrationStep,b:LegacyTableMigrationStep)=>!!a.phaseTarget&&!!b.phaseTarget&&a.phaseTarget.table===b.phaseTarget.table&&refKey(a.phaseTarget.field)===refKey(b.phaseTarget.field);
 const depDrop=(step:LegacyTableMigrationStep)=>step.phaseOperation==='dependency-drop';
 const depAdd=(step:LegacyTableMigrationStep)=>step.phaseOperation==='dependency-add';
 const references=ordered.map(step=>step.phaseDependency?g11DependencyRefs(step.phaseOperation==='dependency-drop'?previous:next,step.phaseDependency):[]);
 for(let i=0;i<ordered.length;i++)for(let j=0;j<ordered.length;j++){
  const a=ordered[i]!,b=ordered[j]!;
  if(depDrop(a)&&b.phaseOperation==='drop-column'&&references[i]!.some(ref=>ref.table===b.phaseTarget!.table&&refKey(ref.field)===refKey(b.phaseTarget!.field)))addEdge(i,j);
  if(depDrop(a)&&depDrop(b)&&a.phaseDependency?.kind==='foreignKey'&&b.phaseDependency?.kind==='key'){
   const target=g11ForeignKeyTarget(previous,a.phaseDependency.table,a.phaseDependency.id);if(target?.table===b.phaseDependency.table&&target.key===b.phaseDependency.id)addEdge(i,j);
  }
  if(depAdd(a)&&depAdd(b)&&a.phaseDependency?.kind==='key'&&b.phaseDependency?.kind==='foreignKey'){
   const target=g11ForeignKeyTarget(next,b.phaseDependency.table,b.phaseDependency.id);if(target?.table===a.phaseDependency.table&&target.key===a.phaseDependency.id)addEdge(i,j);
  }
  if(a.phaseOperation==='drop-column'&&b.phaseOperation==='add-column'&&a.phaseTarget?.table===b.phaseTarget?.table){
   const old=previous.expectedCatalog.columns.find(c=>c.table===a.phaseTarget!.table&&refKey(c.field)===refKey(a.phaseTarget!.field));
   const fresh=next.expectedCatalog.columns.find(c=>c.table===b.phaseTarget!.table&&refKey(c.field)===refKey(b.phaseTarget!.field));
   if(old?.name===fresh?.name)addEdge(i,j);
  }
  if(a.phaseOperation==='add-column'&&sameTarget(a,b)&&!depDrop(b))addEdge(i,j);
  if(a.phaseOperation==='backfill'&&sameTarget(a,b)&&['install-default','target-check','tighten-not-null'].includes(b.phaseOperation??''))addEdge(i,j);
  if(a.phaseOperation==='target-check'&&sameTarget(a,b)&&b.phaseOperation==='tighten-not-null')addEdge(i,j);
  if(depAdd(b)&&a.phaseTarget&&references[j]!.some(ref=>ref.table===a.phaseTarget!.table&&refKey(ref.field)===refKey(a.phaseTarget!.field))&&['add-column','backfill','install-default','target-check','tighten-not-null'].includes(a.phaseOperation??''))addEdge(i,j);
 }
 const ready:number[]=[];for(let i=0;i<indegree.length;i++)if(indegree[i]===0)ready.push(i);
 const result:LegacyTableMigrationStep[]=[];
 while(ready.length){const index=ready.shift()!;result.push(ordered[index]!);for(const target of edges[index]!){indegree[target]!--;if(indegree[target]===0){const at=ready.findIndex(item=>item>target);if(at<0)ready.push(target);else ready.splice(at,0,target);}}}
 if(result.length!==ordered.length)fail('G11 typed dependency schedule contains a cycle','/steps');
 return result;
}
function groupBy<T>(values:readonly T[],key:(value:T)=>string):Map<string,T[]>{
 const result=new Map<string,T[]>();for(const value of values){const id=key(value),group=result.get(id);if(group)group.push(value);else result.set(id,[value]);}return result;
}
function appendOnly(previous:TableDeploymentBundle,next:TableDeploymentBundle,options?:LegacyTableMigrationOptions,allowLegacyUnreviewedPolicy=false):MigrationChanges{
 if(!same(previous.configuration,next.configuration))fail('Changing module, namespace or trusted role configuration requires a separately qualified migration','/next/configuration');
 const a=readDocument(previous.source.utf8,previous.source.format),b=readDocument(next.source.utf8,next.source.format);
 if(!same({...a,modules:[]},{...b,modules:[]}))fail('Root metadata/vocabulary changes require a separately qualified migration','/next/source');
 if(a.modules.length!==b.modules.length)fail('Module inventory changes are outside the append-table migration subset','/next/source');
 const moduleIndex=a.modules.findIndex(module=>module.id===previous.module);
 if(moduleIndex<0)fail('The selected source module is missing','/previous/module');
 const appendedFields=new Set<string>();
 const reviewed=options?.reviewedChanges??[];
 const g11SourceCandidates=options?.version==='umf.table-migration-options/0.6'?discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}):[];
 const g11DependencyChanged=(kind:ReviewedChangeKind,tableId:string,dependencyKind:G11DependencyKind,id:string):boolean=>{
  const oldPath=g11DependencyPath(previous,tableId,dependencyKind,id),catalogProperty=dependencyKind==='foreignKey'?'foreignKeys':dependencyKind==='index'?'indexes':dependencyKind==='key'?'keys':'checks',oldCatalog=(previous.expectedCatalog[catalogProperty] as any[]).find(item=>item.table===tableId&&item.id===id),newCatalog=(next.expectedCatalog[catalogProperty] as any[]).find(item=>item.table===tableId&&item.id===oldCatalog?.id),newPath=newCatalog?g11DependencyPath(next,tableId,dependencyKind,newCatalog.id):null;
  return g11SourceCandidates.some(candidate=>candidate.kind===kind&&candidate.oldPath===oldPath&&candidate.newPath===newPath);
 };
 for(let i=0;i<a.modules.length;i++){
  const old=a.modules[i]!,fresh=b.modules[i]!;
  if(old.id!==previous.module){if(!same(old,fresh))fail('Unselected module changes require separate qualification','/next/source');continue;}
  if(!same({...old,elements:[],relationships:[],extensions:without(old.extensions??{},['umf.tables'])},{...fresh,elements:[],relationships:[],extensions:without(fresh.extensions??{},['umf.tables'])}))fail('Selected module metadata changes require separate qualification','/next/source');
  if((options?.version!=='umf.table-migration-options/0.6'&&fresh.elements.length<old.elements.length)||!same(old.relationships??[],fresh.relationships??[]))fail('G11/append migration preserves complete relationship declarations','/next/source');
  const newFieldIds=new Set(fresh.elements.filter((element:any)=>element.kind==='field'&&!old.elements.some((before:any)=>before.id===element.id)).map((element:any)=>element.id));
  if(options?.version==='umf.table-migration-options/0.6')for(const id of newFieldIds)appendedFields.add(refKey({module:old.id,element:id}));
  if(options?.version!=='umf.table-migration-options/0.6')for(let j=0;j<old.elements.length;j++){
   const before=old.elements[j]!,after=fresh.elements[j]!;
   if(same(before,after))continue;
   if(before.kind==='field'&&after.kind==='field'&&before.id===after.id&&before.nullability==='absent-allowed'&&after.nullability==='required'&&same(without(before,['nullability']),without(after,['nullability']))){
    const column=previous.expectedCatalog.columns.find(c=>c.field.module===old.id&&c.field.element===before.id);
    if(!column||!options?.reviewedChanges||!reviewedMatch(options.reviewedChanges,previous,next,'tighten-not-null',column.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed NOT NULL tightening for column '+(column?.table??'unknown')+'.'+(column?.name??before.id),'/next/source/modules/'+i+'/elements/'+j);
    continue;
   }
   if(before.kind==='field'&&after.kind==='field'&&before.id===after.id&&before.nullability==='required'&&after.nullability==='absent-allowed'&&same(without(before,['nullability']),without(after,['nullability']))){
    const column=previous.expectedCatalog.columns.find(c=>c.field.module===old.id&&c.field.element===before.id);
    if(!column||!reviewedMatch(reviewed,previous,next,'relax-not-null',column.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed NOT NULL relaxation for column '+(column?.table??'unknown')+'.'+(column?.name??before.id),'/next/source/modules/'+i+'/elements/'+j);
    continue;
   }
   if(before.kind==='field'&&after.kind==='field'&&before.id===after.id&&same(without(before,['facets']),without(after,['facets']))&&canonical(before.facets??null)!==canonical(after.facets??null)){
    const column=previous.expectedCatalog.columns.find(c=>c.field.module===old.id&&c.field.element===before.id);
    if(!column||!options?.reviewedChanges||!reviewedMatch(options.reviewedChanges,previous,next,'change-column-type',column.sourcePath,'pg-cast-v1'))throw new UmfError('destructive_change_unreviewed','Unreviewed type or capacity change for column '+(column?.table??'unknown')+'.'+(column?.name??before.id),'/next/source/modules/'+i+'/elements/'+j);
    continue;
   }
   const previousMembers=before.kind==='record'?before.members??[]:[],nextMembers=after.kind==='record'?after.members??[]:[];
   if(same(without(before,['description']),without(after,['description'])))continue;
   const removed=previousMembers.filter(member=>!nextMembers.some(freshMember=>refKey(freshMember)===refKey(member)));
   const retainedMembers=previousMembers.filter(member=>!removed.some(x=>refKey(x)===refKey(member)));
   const nextRetainedMembers=nextMembers.slice(0,Math.max(0,nextMembers.length-(fresh.elements.length-old.elements.length)));
   if(before.kind!=='record'||after.kind!=='record'||!same(without({...before,members:[]},['description','keys']),without({...after,members:[]},['description','keys']))||!same(retainedMembers,nextRetainedMembers))fail('Existing logical elements must remain exact except explicitly reviewed column removal and key evolution','/next/source/modules/'+i+'/elements/'+j);
   for(const member of removed){const column=previous.expectedCatalog.columns.find(c=>refKey(c.field)===refKey(member));if(!column||!reviewed.some(change=>change.kind==='drop-column'&&change.path===column.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed removal of existing column '+(column?.name??member.element)+' from table '+(previous.expectedCatalog.tables.find(t=>t.columns.some(c=>refKey(c.field)===refKey(member)))?.name??'unknown'),'/next/source/modules/'+i+'/elements/'+j+'/members');}
   for(const member of nextMembers.slice(previousMembers.length)){
    if(member.module!==old.id||!newFieldIds.has(member.element))fail('An existing Record may only append newly declared Fields','/next/source/modules/'+i+'/elements/'+j+'/members');
    const key=refKey(member);if(appendedFields.has(key))fail('An appended Field may belong to only one existing Record','/next/source/modules/'+i+'/elements/'+j+'/members');appendedFields.add(key);
   }
  }
 }
 const oldTables=previous.expectedCatalog.tables,nextTables=next.expectedCatalog.tables;
 if(nextTables.length<oldTables.length)fail('Removing native tables requires separate qualification','/next/expectedCatalog/tables');
 const previousColumns=groupBy(previous.expectedCatalog.columns,item=>item.table),nextColumns=groupBy(next.expectedCatalog.columns,item=>item.table);
 const previousIndexes=groupBy(previous.expectedCatalog.indexes,item=>item.table),nextIndexes=groupBy(next.expectedCatalog.indexes,item=>item.table);
 const previousChecks=groupBy(previous.expectedCatalog.checks,item=>item.table),nextChecks=groupBy(next.expectedCatalog.checks,item=>item.table);
 const previousKeys=groupBy(previous.expectedCatalog.keys,item=>item.table),nextKeys=groupBy(next.expectedCatalog.keys,item=>item.table);
 const previousForeignKeys=groupBy(previous.expectedCatalog.foreignKeys,item=>item.table),nextForeignKeys=groupBy(next.expectedCatalog.foreignKeys,item=>item.table);
 const previousPolicyGrants=groupBy(previous.steps.filter(step=>step.kind==='grant'&&step.sourcePath.includes('/policy/')),step=>step.sourcePath);
 const nextPolicyGrants=groupBy(next.steps.filter(step=>step.kind==='grant'&&step.sourcePath.includes('/policy/')),step=>step.sourcePath);
 const policyChanges=new Set<string>(),columnChanges=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),droppedColumns=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),renamedColumns=new Map<number,ColumnPair[]>(),notNullColumns=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),relaxNullColumns=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),typeChanges=new Map<number,ColumnPair[]>(),indexChanges=new Map<number,IndexEvolution>(),keyChanges=new Map<number,KeyEvolution>(),foreignKeyChanges=new Map<number,ForeignKeyEvolution>(),checkChanges=new Map<number,TableDeploymentBundle['expectedCatalog']['checks']>(),droppedChecks=new Map<number,TableDeploymentBundle['expectedCatalog']['checks']>(),checkPaths=new Map<number,Map<string,string>>(),grantChanges=new Map<string,GrantChange>();
 for(const[tableIndex,table]of oldTables.entries()){
  const target=nextTables[tableIndex]!;
  if(!same(without(table,['indexes','columns','policy','checks','foreignKeys']),without(target,['indexes','columns','policy','checks','foreignKeys'])))fail('Existing table definitions must remain exact except for reviewed object changes and appended columns','/next/expectedCatalog/tables/'+tableIndex);
  const oldTableColumns=previousColumns.get(table.id)??[],nextTableColumns=nextColumns.get(table.id)??[];
  const removed=oldTableColumns.filter(column=>!nextTableColumns.some(fresh=>refKey(fresh.field)===refKey(column.field)));
  const appended=nextTableColumns.filter(column=>!oldTableColumns.some(old=>refKey(old.field)===refKey(column.field)));
  if(removed.length&&appended.length&&options?.version!=='umf.table-migration-options/0.6')fail('Combining column removal with appended columns on one existing table is not yet qualified','/next/expectedCatalog/tables/'+tableIndex+'/columns');
  const retained=table.columns.filter(column=>!removed.some(old=>refKey(old.field)===refKey(column.field)));
  const expectedRetained=target.columns.filter(column=>oldTableColumns.some(old=>refKey(old.field)===refKey(column.field)));
  const oldExpected=oldTableColumns.filter(column=>!removed.some(old=>refKey(old.field)===refKey(column.field))),newExpected=nextTableColumns.filter(column=>oldExpected.some(old=>refKey(old.field)===refKey(column.field)));
  const renames:ColumnPair[]=[],typeChangesForTable:ColumnPair[]=[],tightened:typeof oldExpected=[],relaxed:typeof oldExpected=[];
  for(const old of oldExpected){const fresh=newExpected.find(item=>refKey(item.field)===refKey(old.field));if(!fresh)continue;
   const tableColumn=table.columns.find(item=>refKey(item.field)===refKey(old.field))!,freshTableColumn=target.columns.find(item=>refKey(item.field)===refKey(old.field))!;
   const changedName=old.name!==fresh.name,changedType=canonical({typeSchema:old.typeSchema,typeName:old.typeName,typeMod:old.typeMod})!==canonical({typeSchema:fresh.typeSchema,typeName:fresh.typeName,typeMod:fresh.typeMod}),changedNull=old.nullable!==fresh.nullable;
   const oldPhysical=without(tableColumn,['name']),newPhysical=without(freshTableColumn,['name']);
   let expectedDefinition=old.definitionSql;
   if(changedName)expectedDefinition=expectedDefinition.replace(quoteIdentifier(old.name)+' ',quoteIdentifier(fresh.name)+' ');
   if(changedNull){
    if(options?.version==='umf.table-migration-options/0.3'||options?.version==='umf.table-migration-options/0.4')expectedDefinition=columnDefinitionSql(freshTableColumn,fresh.nullable);
    else if(fresh.nullable)expectedDefinition=expectedDefinition.replace(/ NOT NULL$/,'');
    else expectedDefinition+=' NOT NULL';
   }
   const unchangedCatalog=without(old,['name','nullable','definitionSql']),freshUnchanged=without(fresh,['name','nullable','definitionSql']);
   if((changedName||changedNull)&&same(oldPhysical,newPhysical)&&same(unchangedCatalog,freshUnchanged)&&fresh.definitionSql===expectedDefinition){
    if(changedName&&!reviewedMatch(reviewed,previous,next,'rename-column',fresh.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed rename of column '+table.name+'.'+old.name,'/next/expectedCatalog/columns');
    if(changedName)renames.push({old,fresh});
    if(changedNull&&!fresh.nullable&&!reviewedMatch(reviewed,previous,next,'tighten-not-null',fresh.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed NOT NULL tightening for column '+table.name+'.'+old.name,'/next/expectedCatalog/columns');
    if(changedNull&&fresh.nullable&&!reviewedMatch(reviewed,previous,next,'relax-not-null',fresh.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed NOT NULL relaxation for column '+table.name+'.'+old.name,'/next/expectedCatalog/columns');
    if(changedNull){if(fresh.nullable)relaxed.push(fresh);else tightened.push(fresh);}
    continue;
   }
   const oldLogicalField=a.modules.find(m=>m.id===old.field.module)?.elements.find(e=>e.id===old.field.element),newLogicalField=b.modules.find(m=>m.id===fresh.field.module)?.elements.find(e=>e.id===fresh.field.element);
   const logicalTypeOnly=!!oldLogicalField&&!!newLogicalField&&same(without(oldLogicalField,['facets']),without(newLogicalField,['facets']))&&(tableColumn.nativeType.kind==='numeric'
    ? [oldLogicalField.facets,newLogicalField.facets].every((facets,index)=>{const physical=(index===0?tableColumn.nativeType:freshTableColumn.nativeType) as any;return !!facets&&Object.keys(facets).sort().join(',')==='precision,scale'&&same(facets,{precision:physical.precision,scale:physical.scale});})
    : same(oldLogicalField,newLogicalField));
   const mappingTypeOnly=same(without(tableColumn,['nativeType','sourcePath']),without(freshTableColumn,['nativeType','sourcePath']));
   if(changedType&&!changedName&&!changedNull&&mappingTypeOnly&&safeWidening(tableColumn.nativeType,freshTableColumn.nativeType)&&logicalTypeOnly){
    if(!reviewedMatch(reviewed,previous,next,'change-column-type',fresh.sourcePath,'pg-cast-v1'))throw new UmfError('destructive_change_unreviewed','Safe type widening for '+table.name+'.'+old.name+' requires an exact pg-cast-v1 review marker',fresh.sourcePath);
    typeChangesForTable.push({old,fresh});continue;
   }
   if(!same(without(tableColumn,['name','sourcePath']),without(freshTableColumn,['name','sourcePath']))||!same(without(old,['sourcePath']),without(fresh,['sourcePath'])))fail('Existing native column type or semantics changed beyond the supported reviewed subset','/next/expectedCatalog/tables/'+tableIndex+'/columns');
  }
  const evolvedRefs=new Set([...renames.map(r=>refKey(r.old.field)),...tightened.map(c=>refKey(c.field)),...relaxed.map(c=>refKey(c.field)),...typeChangesForTable.map(c=>refKey(c.old.field))]);
  if(!same(withoutSourcePaths(retained.filter(x=>!evolvedRefs.has(refKey(x.field)))),withoutSourcePaths(expectedRetained.filter(x=>!evolvedRefs.has(refKey(x.field)))))||!same(withoutSourcePaths(oldExpected.filter(x=>!evolvedRefs.has(refKey(x.field)))),withoutSourcePaths(newExpected.filter(x=>!evolvedRefs.has(refKey(x.field))))))fail('Existing native columns changed beyond reviewed changes','/next/expectedCatalog/tables/'+tableIndex+'/columns');
  if(renames.length)renamedColumns.set(tableIndex,renames);if(tightened.length)notNullColumns.set(tableIndex,tightened);if(relaxed.length)relaxNullColumns.set(tableIndex,relaxed);if(typeChangesForTable.length)typeChanges.set(tableIndex,typeChangesForTable);
  if(removed.length){
   for(const column of removed){if(!reviewedMatch(reviewed,previous,next,'drop-column',column.sourcePath))unreviewedDrop(column,previous,next);if(options?.version!=='umf.table-migration-options/0.6')assertNoColumnDependents(column,previous,next);}
   droppedColumns.set(tableIndex,removed);
  }
  const additions=options?.version==='umf.table-migration-options/0.6'?target.columns.filter(column=>!table.columns.some(old=>refKey(old.field)===refKey(column.field))):target.columns.slice(table.columns.length);
  if(additions.length){
   const expectations=options?.version==='umf.table-migration-options/0.6'?nextTableColumns.filter(column=>!oldTableColumns.some(old=>refKey(old.field)===refKey(column.field))):nextTableColumns.slice(table.columns.length);
   if(expectations.length!==additions.length)fail('Appended columns do not match the compiled native column catalog','/next/expectedCatalog/columns');
   const expectationByField=new Map(expectations.map(item=>[refKey(item.field),item]));
   const pathsByConstraint=new Map<string,string>();
   for(const column of additions){
    const key=refKey(column.field),expected=expectationByField.get(key),expectedPath=expected?.sourcePath;
    if(!appendedFields.has(key)||!expected||!expectedPath||(expected.nullable!==true&&!options?.backfills.some(b=>b.table===table.id&&refKey(b.column)===key))||expected.identity!==''||(column.default!==undefined&&options?.version!=='umf.table-migration-options/0.6'&&!options?.backfills.some(b=>b.table===table.id&&refKey(b.column)===key))||column.generated!==undefined)fail('Appended required columns require explicit scoped backfills; defaults/identity evolution is unsupported','/next/expectedCatalog/tables/'+tableIndex+'/columns');
    appendedFields.delete(key);pathsByConstraint.set('umf_d_'+hashCanonical([target.id,column.field,'finite-domain']).slice(0,32),expectedPath+'/domain');
   }
   columnChanges.set(tableIndex,expectations);
   checkPaths.set(tableIndex,pathsByConstraint);
  }
  const before=previousIndexes.get(table.id)??[],after=nextIndexes.get(table.id)??[],indexDrops:typeof before=[],indexReplacements=new Set<string>();
  for(const[oldIndex,index]of before.entries()){
   const fresh=after.find(item=>item.id===index.id),declarationIndex=table.indexes.findIndex(item=>item.id===index.id),path='/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/indexes/'+declarationIndex;
   const sourceChanged=options?.version==='umf.table-migration-options/0.6'&&g11DependencyChanged('replace-index',table.id,'index',index.id);
   if(!fresh){if(!reviewedMatch(reviewed,previous,next,'replace-index',path,undefined,options?.version==='umf.table-migration-options/0.6'?'umf.table-migration-discovery/0.3':undefined))throw new UmfError('destructive_change_unreviewed','Unreviewed removal of index '+index.name,'/next/expectedCatalog/indexes');indexDrops.push(index);continue;}
   if(!same(index,fresh)||sourceChanged){if(!reviewedMatch(reviewed,previous,next,'replace-index',path,undefined,options?.version==='umf.table-migration-options/0.6'?'umf.table-migration-discovery/0.3':undefined))throw new UmfError('destructive_change_unreviewed','Unreviewed replacement of index '+index.name,'/next/expectedCatalog/indexes');indexDrops.push(index);indexReplacements.add(fresh.id);}
  }
  if(indexDrops.length||indexReplacements.size)indexChanges.set(tableIndex,{drops:indexDrops,replacements:indexReplacements});
  const oldCheckEntries=previousChecks.get(table.id)??[],newCheckEntries=nextChecks.get(table.id)??[],removedChecks:typeof oldCheckEntries=[],addedChecks:typeof newCheckEntries=[];
  for(const old of oldCheckEntries){const fresh=newCheckEntries.find(item=>item.id===old.id),sourceChanged=options?.version==='umf.table-migration-options/0.6'&&!old.id.startsWith('domain:')&&g11DependencyChanged('replace-check',table.id,'check',old.id);if(!fresh||!same(old,fresh)||sourceChanged){
   const checkIndex=table.checks.findIndex(item=>item.id===old.id),path=options?.version==='umf.table-migration-options/0.6'&&old.id.startsWith('domain:')?g11DependencyPath(previous!,table.id,'check',old.id):'/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/checks/'+checkIndex;
   if(!reviewedMatch(reviewed,previous,next,'replace-check',path,undefined,options?.version==='umf.table-migration-options/0.6'?'umf.table-migration-discovery/0.3':undefined))throw new UmfError('destructive_change_unreviewed','Unreviewed replacement/removal of check constraint '+old.name,path);
   removedChecks.push(old);if(fresh)addedChecks.push(fresh);
  }}
  for(const fresh of newCheckEntries)if(!oldCheckEntries.some(old=>old.id===fresh.id))addedChecks.push(fresh);
  if(removedChecks.length)droppedChecks.set(tableIndex,removedChecks);
  if(addedChecks.length){
   const allowedDomainNames=new Set(additions.map(column=>'umf_d_'+hashCanonical([table.id,column.field,'finite-domain']).slice(0,32)));
   if(!options&&addedChecks.some(entry=>!allowedDomainNames.has(entry.name)))fail('Only compiler-generated domain checks for appended columns are qualified','/next/expectedCatalog/checks');
   checkChanges.set(tableIndex,addedChecks);
  }
  const oldKeys=previousKeys.get(table.id)??[],newKeys=nextKeys.get(table.id)??[],dropKeys:typeof oldKeys=[],addKeys:typeof newKeys=[];
  for(const oldKey of oldKeys){const fresh=newKeys.find(key=>key.id===oldKey.id),sourceChanged=options?.version==='umf.table-migration-options/0.6'&&g11DependencyChanged('replace-primary-key',table.id,'key',oldKey.id);if(same(oldKey,fresh??null)&&!sourceChanged)continue;
   const record=a.modules.find(m=>m.id===table.record.module)?.elements.find(e=>e.id===table.record.element) as any,index=record?.keys?.findIndex((key:any)=>key.id===oldKey.id)??-1,path='/modules/'+a.modules.findIndex(m=>m.id===table.record.module)+'/elements/'+a.modules.find(m=>m.id===table.record.module)?.elements.findIndex(e=>e.id===table.record.element)+'/keys/'+index;
   const reviewPath=options?.version==='umf.table-migration-options/0.6'&&fresh?g11DependencyPath(next,table.id,'key',fresh.id):path;
   if(!reviewedMatch(reviewed,previous,next,'replace-primary-key',reviewPath,undefined,options?.version==='umf.table-migration-options/0.6'?'umf.table-migration-discovery/0.3':undefined))throw new UmfError('destructive_change_unreviewed','Unreviewed replacement/removal of key '+oldKey.name,path);
   if(options?.version!=='umf.table-migration-options/0.6'&&previous.expectedCatalog.foreignKeys.some(fk=>fk.targetKey===oldKey.name))fail('Primary key '+oldKey.name+' has inbound foreign-key dependents: '+previous.expectedCatalog.foreignKeys.filter(fk=>fk.targetKey===oldKey.name).map(fk=>fk.name).join(', '),path);
   dropKeys.push(oldKey);if(fresh)addKeys.push(fresh);
  }
  for(const fresh of newKeys)if(!oldKeys.some(old=>old.id===fresh.id)){
   if(options?.version!=='umf.table-migration-options/0.6')fail('Adding a new key alongside an existing key requires separate qualification',fresh.definitionSql);
   const path=options?.version==='umf.table-migration-options/0.6'?g11DependencyPath(next,table.id,'key',fresh.id):(()=>{const record=a.modules.find(m=>m.id===table.record.module)?.elements.find(e=>e.kind==='record'&&e.id===table.record.element) as any,index=record?.keys?.findIndex((key:any)=>key.id===fresh.id)??-1;return '/modules/'+a.modules.findIndex(m=>m.id===table.record.module)+'/elements/'+a.modules.find(m=>m.id===table.record.module)?.elements.findIndex(e=>e.id===table.record.element)+'/keys/'+index;})();
   if(!reviewedMatch(reviewed,previous,next,'replace-primary-key',path,undefined,options?.version==='umf.table-migration-options/0.6'?'umf.table-migration-discovery/0.3':undefined))fail('New G11 Key requires its exact source marker',path);
   addKeys.push(fresh);
  }
  if(dropKeys.length||addKeys.length)keyChanges.set(tableIndex,{drops:dropKeys,adds:addKeys});
  const oldForeignKeys=previousForeignKeys.get(table.id)??[],newForeignKeys=nextForeignKeys.get(table.id)??[],dropForeignKeys:typeof oldForeignKeys=[],replaceForeignKeys=new Set<string>();
  for(const oldFk of oldForeignKeys){const fresh=newForeignKeys.find(fk=>fk.id===oldFk.id),ownSourceChanged=options?.version==='umf.table-migration-options/0.6'&&g11DependencyChanged('replace-foreign-key',table.id,'foreignKey',oldFk.id),target=g11ForeignKeyTarget(previous,table.id,oldFk.id),targetKeyChanged=options?.version==='umf.table-migration-options/0.6'&&!!target&&g11DependencyChanged('replace-primary-key',target.table,'key',target.key),sourceChanged=ownSourceChanged||targetKeyChanged;if(same(oldFk,fresh??null)&&!sourceChanged)continue;
   if(targetKeyChanged&&!g11KeyChangeHasMarker(previous,target!.table,target!.key,g11SourceCandidates))fail('Referenced G11 Key replacement requires its exact source marker',oldFk.name);
   const fkIndex=table.foreignKeys.findIndex(fk=>fk.id===oldFk.id),path='/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/foreignKeys/'+fkIndex;
   if(!targetKeyChanged&&!reviewedMatch(reviewed,previous,next,'replace-foreign-key',path,undefined,options?.version==='umf.table-migration-options/0.6'?'umf.table-migration-discovery/0.3':undefined))throw new UmfError('destructive_change_unreviewed','Unreviewed replacement/removal of foreign key '+oldFk.name,path);
   dropForeignKeys.push(oldFk);if(fresh)replaceForeignKeys.add(fresh.id);
  }
  if(dropForeignKeys.length||replaceForeignKeys.size)foreignKeyChanges.set(tableIndex,{drops:dropForeignKeys,replacements:replaceForeignKeys});
  if(!options&&!same(oldForeignKeys,newForeignKeys))fail('New foreign keys require explicit migration options','/next/expectedCatalog/foreignKeys');
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){
   const path=policyPath(moduleIndex,tableIndex,audience,command);
   if(!same(table.policy[audience][command],target.policy[audience][command])){
    if(!allowLegacyUnreviewedPolicy&&!reviewedMatch(reviewed,previous,next,'change-policy',path))throw new UmfError('destructive_change_unreviewed','Unreviewed policy change for '+table.id+'.'+audience+'.'+command,path);
    policyChanges.add(path);
   }
   const oldGrants=previousPolicyGrants.get(path)??[],newGrants=nextPolicyGrants.get(path)??[];
   if(!same(oldGrants.map(step=>step.sql),newGrants.map(step=>step.sql)))grantChanges.set(path,{previous:oldGrants,next:newGrants});
  }
 }
 if(appendedFields.size)fail('Every appended Field on an existing Record needs one nullable native column mapping','/next/expectedCatalog/tables');
 return {policyChanges,columnChanges,droppedColumns,renamedColumns,notNullColumns,relaxNullColumns,typeChanges,indexChanges,keyChanges,foreignKeyChanges,checkChanges,droppedChecks,checkPaths,grantChanges};
}

function unreviewedDrop(column:TableDeploymentBundle['expectedCatalog']['columns'][number],previous:TableDeploymentBundle,next:TableDeploymentBundle):never{
 throw new UmfError('destructive_change_unreviewed','Unreviewed removal of column '+column.table+'.'+column.name,'/next/expectedCatalog/columns');
}
function assertNoColumnDependents(column:TableDeploymentBundle['expectedCatalog']['columns'][number],previous:TableDeploymentBundle,next:TableDeploymentBundle):void{
 const table=previous.expectedCatalog.tables.find(t=>t.id===column.table)!;
 const quoted=quoteIdentifier(column.name),affected:string[]=[];
 for(const step of previous.steps){if(step.sourcePath.endsWith('/tables/'+previous.expectedCatalog.tables.findIndex(t=>t.id===column.table))||step.sourcePath.includes('/columns/')||step.kind==='comment'||!step.sql.includes(quoted))continue;
  const successor=next.steps.find(fresh=>fresh.sourcePath===step.sourcePath);
  if(!successor||successor.sql.includes(quoted))affected.push(step.sourcePath);
 }
 for(const index of previous.expectedCatalog.indexes.filter(x=>x.table===column.table&&x.definitionSql.includes(quoted))){const fresh=next.expectedCatalog.indexes.find(x=>x.table===column.table&&x.id===index.id);if(fresh?.definitionSql.includes(quoted))affected.push('index:'+index.name);}
 for(const check of previous.expectedCatalog.checks.filter(x=>x.table===column.table&&x.definitionSql.includes(quoted))){const fresh=next.expectedCatalog.checks.find(x=>x.table===column.table&&x.id===check.id);if(fresh?.definitionSql.includes(quoted))affected.push('constraint:'+check.name);}
 for(const fk of previous.expectedCatalog.foreignKeys.filter(x=>x.table===column.table&&x.definitionSql.includes(quoted))){const fresh=next.expectedCatalog.foreignKeys.find(x=>x.table===column.table&&x.id===fk.id);if(fresh?.definitionSql.includes(quoted))affected.push('foreign-key:'+fk.name);}
 for(const key of previous.expectedCatalog.keys.filter(x=>x.table===column.table&&x.columns.includes(column.name))){const fresh=next.expectedCatalog.keys.find(x=>x.table===column.table&&x.id===key.id);if(fresh?.columns.includes(column.name))affected.push('key:'+key.name);}
 const localKeys=previous.expectedCatalog.keys.filter(key=>key.table===column.table&&key.columns.includes(column.name));
 for(const fk of previous.expectedCatalog.foreignKeys){if(localKeys.some(key=>key.name===fk.targetKey))affected.push('inbound-foreign-key:'+fk.name);}
 const oldDocument=readDocument(previous.source.utf8,previous.source.format),newDocument=readDocument(next.source.utf8,next.source.format);
 const module=oldDocument.modules.find(m=>m.id===previous.module),nextModule=newDocument.modules.find(m=>m.id===previous.module);
 const tables=(module?.extensions?.['umf.tables'] as any)?.tables??[],nextTables=(nextModule?.extensions?.['umf.tables'] as any)?.tables??[];
 const hasRef=(value:unknown):boolean=>Array.isArray(value)?value.some(hasRef):!!value&&typeof value==='object'?(canonical(value)===canonical(column.field)||Object.values(value).some(hasRef)):false;
 const oldCommands=(module?.extensions?.['umf.tables'] as any)?.commands??[],newCommands=(nextModule?.extensions?.['umf.tables'] as any)?.commands??[];
 for(const[commandIndex,command]of oldCommands.entries())if(hasRef(command)){const successor=newCommands.find((item:any)=>item.id===command.id);if(successor&&hasRef(successor))affected.push('command:'+(command.id??commandIndex));}
 for(const[tableIndex,tableDef]of tables.entries()){
  const fresh=nextTables[tableIndex]??{};
  for(const[kind,items]of Object.entries({checks:tableDef.checks??[],foreignKeys:tableDef.foreignKeys??[],indexes:tableDef.indexes??[]}))for(const item of items as any[]){
   const replacement=(fresh[kind]??[]).find((x:any)=>x.id===item.id);
   if(hasRef(item)&&(!replacement||canonical(item)!==canonical(replacement)))affected.push(kind.slice(0,-1)+':'+item.id);
  }
 }
 for(const oldTable of tables){
  const nextTable=nextTables.find((fresh:any)=>fresh.id===oldTable.id);
  if(!nextTable)continue;
  for(const audience of ['person','batch'])for(const command of ['select','insert','update','delete']){
   const before=oldTable.policy?.[audience]?.[command],after=nextTable.policy?.[audience]?.[command];
   if(hasRef(before)&&hasRef(after))affected.push('policy:'+oldTable.id+'.'+audience+'.'+command);
  }
 }
 if(affected.length)fail('Column '+table.name+'.'+column.name+' is referenced by dependent objects: '+[...new Set(affected)].join(', '),column.sourcePath);
}

/** Inert forward plans: initial deployment, bounded additive DDL or command revisions. */
function compileTableMigrationInternal(input:TableMigrationRequest,allowLegacyUnreviewedPolicy=false,captureInternalOperations=false):TableMigrationResult{
 try{
  preflightG03DefaultLiteral(input);
  const request=copyJson(input) as unknown as TableMigrationRequest;
  if(!request||Object.keys(request).some(k=>!['id','predecessor','previous','next','options'].includes(k))||!['id','predecessor','previous','next'].every(k=>Object.hasOwn(request,k)))fail('Unknown or missing migration request member');
  identity(request.id,'/id');
  if(request.predecessor!==null){
   const predecessor=request.predecessor;
   if(!predecessor||Object.keys(predecessor).length!==2||!Object.hasOwn(predecessor,'id')||!Object.hasOwn(predecessor,'digest'))fail('Expected an exact predecessor identity/digest','/predecessor');
   identity(predecessor.id,'/predecessor/id');
   if(predecessor.id===request.id||typeof predecessor.digest!=='string'||!/^[a-f0-9]{64}$/.test(predecessor.digest))fail('Invalid predecessor identity/digest','/predecessor');
  }
  const previous=request.previous===null?null:verifyTableDeployment(request.previous),next=verifyTableDeployment(request.next);
 if((previous===null)!==(request.predecessor===null))fail('Only initial deployment has a null predecessor','/predecessor');
  const options=migrationOptions(request.options,next,previous);
  if(options?.version==='umf.table-migration-options/0.7'){
   if(!previous)fail('G04 conversion requires an installed predecessor','/previous');
   return {status:'compiled',plan:compileG04ConversionPlan(request as TableMigrationRequest&{previous:TableDeploymentBundle},options as G04MigrationOptions),diagnostics:[]};
  }
  if(options?.version==='umf.table-migration-options/0.5')return compileG03DefaultChangePlan(request,previous!,next,options,captureInternalOperations);
  if((options?.version==='umf.table-migration-options/0.2'||options?.version==='umf.table-migration-options/0.3'||options?.version==='umf.table-migration-options/0.4')&&!previous)fail('Phased plans require an installed predecessor; initial publication is not supported','/previous');
  if(previous&&(options?.version==='umf.table-migration-options/0.2'||options?.version==='umf.table-migration-options/0.3'||options?.version==='umf.table-migration-options/0.4')&&!same(previous.expectedCatalog.tables.map(t=>t.id).sort(),next.expectedCatalog.tables.map(t=>t.id).sort()))fail('Phased plans cannot add or remove tables until the runtime models absent and newly created table identities explicitly','/next/expectedCatalog/tables');
  if(previous&&options?.version==='umf.table-migration-options/0.6'&&!same(previous.expectedCatalog.tables.map(t=>t.id),next.expectedCatalog.tables.map(t=>t.id)))fail('Phased plans cannot add or remove or reorder tables','/next/expectedCatalog/tables');
  let changes:MigrationChanges={policyChanges:new Set(),columnChanges:new Map(),droppedColumns:new Map(),renamedColumns:new Map(),notNullColumns:new Map(),relaxNullColumns:new Map(),typeChanges:new Map(),indexChanges:new Map(),keyChanges:new Map(),foreignKeyChanges:new Map(),checkChanges:new Map(),droppedChecks:new Map(),checkPaths:new Map(),grantChanges:new Map()};
  if(previous){
   changes=appendOnly(previous,next,options,allowLegacyUnreviewedPolicy);
   if(previous.bundleDigest===next.bundleDigest)fail('An unchanged bundle does not create a new migration','/next');
  }
  const moduleIndex=readDocument(next.source.utf8,next.source.format).modules.findIndex(m=>m.id===next.module);
  const steps:TableMigrationStepDraft[]=previous?[]:next.steps;
  if(previous){
   const emittedColumns=new Set<number>();
   const emittedGrantChanges=new Set<string>();
   const revokedGrantChanges=new Set<string>();
   const addRevokes=(path:string,tableIndex:number):void=>{
    const change=changes.grantChanges.get(path);if(!change||!change.previous.length||revokedGrantChanges.has(path))return;
    const parts=path.split('/'),audience=parts[8] as PolicyAudience,table=next.expectedCatalog.tables[tableIndex]!;
    if(!['person','batch'].includes(audience))fail('Unexpected compiler grant source path',path);
    for(const grant of change.previous){
     if(options?.version==='umf.table-migration-options/0.6'){
      const subject=g11DependencySubject(previous!,table.id,'grant','',path),step:TableMigrationStepDraft={id:'',kind:'grant',sourcePath:path,transaction:'required',sql:g11RevokeGrantSql(previous!,table.id,path),phaseOperation:'dependency-drop',phaseDependency:subject,operation:'dependency-drop'};
      steps.push(internalGrantEffect(step,'grant-revoke',previous!,table.id,path));
     }else{
      const sql=options?.version==='umf.table-migration-options/0.4'?g11RevokeGrantSql(previous!,table.id,path):revokeGrantSql(grant,table,next.configuration,audience);
      const step:TableMigrationStepDraft={id:'',kind:'grant',sourcePath:path,transaction:'required',sql};
      steps.push(options?.version==='umf.table-migration-options/0.4'?internalGrantEffect(step,'grant-revoke',previous!,table.id,path):step);
     }
    }
    revokedGrantChanges.add(path);
   };
   for(const step of next.steps){
    const parts=step.sourcePath.split('/');
    if(parts[5]!=='tables'||!/^\d+$/.test(parts[6]??''))continue;
    const tableIndex=Number(parts[6]);
    if(tableIndex>=previous!.expectedCatalog.tables.length){steps.push(step);continue;}
    if(step.kind==='table'&&parts.length===7&&!emittedColumns.has(tableIndex)){
     emittedColumns.add(tableIndex);
     const table=next.expectedCatalog.tables[tableIndex]!;
     if(changes.renamedColumns.get(tableIndex)?.length)for(const path of changes.grantChanges.keys())if(Number(path.split('/')[6])===tableIndex)addRevokes(path,tableIndex);
     for(const rename of changes.renamedColumns.get(tableIndex)??[])steps.push({id:'',kind:'table',sourcePath:rename.fresh.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' RENAME COLUMN '+quoteIdentifier(rename.old.name)+' TO '+quoteIdentifier(rename.fresh.name)});
     for(const column of changes.notNullColumns.get(tableIndex)??[]){
      const fill=options?.version==='umf.table-migration-options/0.3'||options?.version==='umf.table-migration-options/0.4'?options.backfills.find(item=>item.table===table.id&&refKey(item.column)===refKey(column.field)&&previous.expectedCatalog.columns.some(old=>old.table===table.id&&refKey(old.field)===refKey(column.field))):undefined;
      const phaseTarget={table:table.id,field:{...column.field}};
      const mapping=table.columns.find(item=>refKey(item.field)===refKey(column.field))!;
      if(fill){const path='/options/backfills/'+options!.backfills.indexOf(fill),rendered=renderG02FieldEffect({role:'backfill',schema:next.configuration.schema,table:table.id,tableName:table.name,column:mapping,sourcePath:path,field:column.field,rowOperationId:fill.operation}),backfillStep:TableMigrationStepDraft={id:'',kind:'backfill',sourcePath:path,transaction:'required',sql:rendered.sql,operation:fill.operation,phaseOperation:'backfill',phaseTarget};steps.push(internalFieldEffect(backfillStep,'backfill',phaseTarget,fill.operation));}
      const renderedTighten=fill?renderG02FieldEffect({role:'tighten-not-null',schema:next.configuration.schema,table:table.id,tableName:table.name,column:mapping,sourcePath:column.sourcePath,field:column.field}):undefined,tightenStep:TableMigrationStepDraft={id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:renderedTighten?.sql??'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' SET NOT NULL',...(fill?{phaseOperation:'tighten-not-null' as const,phaseTarget}:{})};
      steps.push(fill?internalFieldEffect(tightenStep,'tighten-not-null',phaseTarget):tightenStep);
     }
     for(const column of changes.relaxNullColumns.get(tableIndex)??[])steps.push({id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' DROP NOT NULL'});
     for(const change of changes.typeChanges.get(tableIndex)??[]){const targetColumn=table.columns.find(c=>refKey(c.field)===refKey(change.fresh.field))!;const type=nativeType(targetColumn.nativeType);steps.push({id:'',kind:'table',sourcePath:change.fresh.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(change.fresh.name)+' TYPE '+type+' USING '+quoteIdentifier(change.old.name)+'::'+type});}
     for(const index of changes.indexChanges.get(tableIndex)?.drops??[]){const typed=options?.version==='umf.table-migration-options/0.6',sourcePath=typed?g11DependencyPath(previous,table.id,'index',index.id):'/next/expectedCatalog/indexes/'+index.id,subject=typed?g11DependencySubject(previous,table.id,'index',index.id,sourcePath):undefined,step:TableMigrationStepDraft={id:'',kind:'index',sourcePath,transaction:'required',sql:'DROP INDEX '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(index.name),...(subject?{phaseOperation:'dependency-drop' as const,phaseDependency:subject,operation:'dependency-drop'}:{})};steps.push(subject?internalDependencyEffect(step,'dependency-drop',subject):step);}
     for(const check of changes.droppedChecks.get(tableIndex)??[]){const typed=options?.version==='umf.table-migration-options/0.6',sourcePath=typed?g11DependencyPath(previous,table.id,'check',check.id):'/next/expectedCatalog/checks/'+check.id,subject=typed?g11DependencySubject(previous,table.id,'check',check.id,sourcePath):undefined,step:TableMigrationStepDraft={id:'',kind:'table',sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' DROP CONSTRAINT '+quoteIdentifier(check.name),...(subject?{phaseOperation:'dependency-drop' as const,phaseDependency:subject,operation:'dependency-drop'}:{})};steps.push(subject?internalDependencyEffect(step,'dependency-drop',subject):step);}
     for(const fk of changes.foreignKeyChanges.get(tableIndex)?.drops??[]){const typed=options?.version==='umf.table-migration-options/0.6',sourcePath=typed?g11DependencyPath(previous,table.id,'foreignKey',fk.id):'/next/expectedCatalog/foreignKeys/'+fk.id,subject=typed?g11DependencySubject(previous,table.id,'foreignKey',fk.id,sourcePath):undefined,step:TableMigrationStepDraft={id:'',kind:typed?'foreignKey':'table',sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' DROP CONSTRAINT '+quoteIdentifier(fk.name),...(subject?{phaseOperation:'dependency-drop' as const,phaseDependency:subject,operation:'dependency-drop'}:{})};steps.push(subject?internalDependencyEffect(step,'dependency-drop',subject):step);}
     for(const key of changes.keyChanges.get(tableIndex)?.drops??[]){const typed=options?.version==='umf.table-migration-options/0.6',sourcePath=typed?g11DependencyPath(previous,table.id,'key',key.id):'/next/expectedCatalog/keys/'+key.id,subject=typed?g11DependencySubject(previous,table.id,'key',key.id,sourcePath):undefined,step:TableMigrationStepDraft={id:'',kind:'table',sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' DROP CONSTRAINT '+quoteIdentifier(key.name),...(subject?{phaseOperation:'dependency-drop' as const,phaseDependency:subject,operation:'dependency-drop'}:{})};steps.push(subject?internalDependencyEffect(step,'dependency-drop',subject):step);}
     for(const key of changes.keyChanges.get(tableIndex)?.adds??[]){const typed=options?.version==='umf.table-migration-options/0.6',sourcePath=typed?g11DependencyPath(next,table.id,'key',key.id):'/next/expectedCatalog/keys/'+key.id,subject=typed?g11DependencySubject(next,table.id,'key',key.id,sourcePath):undefined,step:TableMigrationStepDraft={id:'',kind:'table',sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ADD '+key.definitionSql,...(subject?{phaseOperation:'dependency-add' as const,phaseDependency:subject,operation:'dependency-add'}:{})};steps.push(subject?internalDependencyEffect(step,'dependency-add',subject):step);}
     for(const column of changes.columnChanges.get(tableIndex)??[]){
      const selectedAppend=(options?.version==='umf.table-migration-options/0.4'||options?.version==='umf.table-migration-options/0.6')&&(options.version==='umf.table-migration-options/0.6'||options.backfills.some(b=>b.table===table.id&&refKey(b.column)===refKey(column.field)&&!previous.expectedCatalog.columns.some(old=>old.table===table.id&&refKey(old.field)===refKey(column.field))));
      const phaseTarget={table:table.id,field:{...column.field}},mapping=table.columns.find(c=>refKey(c.field)===refKey(column.field))!,rendered=selectedAppend?renderG02FieldEffect({role:'add-column',schema:next.configuration.schema,table:table.id,tableName:table.name,column:mapping,collation:column.collation,sourcePath:column.sourcePath,field:column.field}):undefined,step:TableMigrationStepDraft={id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:rendered?.sql??'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ADD COLUMN '+(quoteIdentifier(column.name)+' '+nativeType(mapping.nativeType)+(column.collation==='C'?' COLLATE pg_catalog.\"C\"':'')),...(selectedAppend?{phaseOperation:'add-column' as const,phaseTarget,...(options?.version==='umf.table-migration-options/0.6'?{operation:'add-column'}:{})}:{})};
      steps.push(selectedAppend?internalFieldEffect(step,'add-column',phaseTarget):step);
     }
   for(const backfill of options?.backfills.filter(b=>b.table===table.id&&!((options.version==='umf.table-migration-options/0.3'||options.version==='umf.table-migration-options/0.4'||options.version==='umf.table-migration-options/0.6')&&previous.expectedCatalog.columns.some(old=>old.table===table.id&&refKey(old.field)===refKey(b.column))))??[]){
      const appended=(options!.version==='umf.table-migration-options/0.4'||options!.version==='umf.table-migration-options/0.6')&&!previous.expectedCatalog.columns.some(old=>old.table===table.id&&refKey(old.field)===refKey(backfill.column));
      const phaseTarget={table:table.id,field:{...backfill.column}};
      const backfillPath='/options/backfills/'+options!.backfills.indexOf(backfill),mapping=table.columns.find(c=>refKey(c.field)===refKey(backfill.column))!,renderedBackfill=appended?renderG02FieldEffect({role:'backfill',schema:next.configuration.schema,table:table.id,tableName:table.name,column:mapping,sourcePath:backfillPath,field:backfill.column,rowOperationId:backfill.operation}):undefined,backfillStep:TableMigrationStepDraft={id:'',kind:'backfill',sourcePath:backfillPath,transaction:'required',sql:renderedBackfill?.sql??'',operation:backfill.operation,...(appended?{phaseOperation:'backfill' as const,phaseTarget}:{})};
      steps.push(appended?internalFieldEffect(backfillStep,'backfill',phaseTarget,backfill.operation):backfillStep);
      const column=next.expectedCatalog.columns.find(c=>c.table===table.id&&refKey(c.field)===refKey(backfill.column))!;
      const defaultValue=table.columns.find(c=>refKey(c.field)===refKey(column.field))!.default;
      const defaultSql=defaultValue?typedDefaultExpressionSql(defaultValue):'';
      if(defaultSql){const mapping=table.columns.find(c=>refKey(c.field)===refKey(column.field))!,rendered=appended?renderG02FieldEffect({role:'install-default',schema:next.configuration.schema,table:table.id,tableName:table.name,column:mapping,sourcePath:column.sourcePath,field:column.field}):undefined,defaultStep:TableMigrationStepDraft={id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:rendered?.sql??'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' SET DEFAULT '+defaultSql,...(appended?{phaseOperation:'install-default' as const,phaseTarget,...(options?.version==='umf.table-migration-options/0.6'?{operation:'install-default'}:{})}:{})};steps.push(appended?internalFieldEffect(defaultStep,'install-default',phaseTarget):defaultStep);}
      if(!column.nullable){const mapping=table.columns.find(c=>refKey(c.field)===refKey(column.field))!,rendered=appended?renderG02FieldEffect({role:'tighten-not-null',schema:next.configuration.schema,table:table.id,tableName:table.name,column:mapping,sourcePath:column.sourcePath,field:column.field}):undefined,tightenStep:TableMigrationStepDraft={id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:rendered?.sql??'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' SET NOT NULL',...(appended?{phaseOperation:'tighten-not-null' as const,phaseTarget,...(options?.version==='umf.table-migration-options/0.6'?{operation:'tighten-not-null'}:{})}:{})};steps.push(appended?internalFieldEffect(tightenStep,'tighten-not-null',phaseTarget):tightenStep);}
     }
     if(options?.version==='umf.table-migration-options/0.6')for(const column of changes.columnChanges.get(tableIndex)??[]){
      if(options.backfills.some(fill=>fill.table===table.id&&refKey(fill.column)===refKey(column.field)))continue;
      const targetTable=next.expectedCatalog.tables.find(item=>item.id===table.id)!;
      const mapping=targetTable.columns.find(item=>refKey(item.field)===refKey(column.field));
      if(!mapping?.default)continue;
      const already=steps.some(step=>step.phaseOperation==='install-default'&&step.phaseTarget?.table===table.id&&refKey(step.phaseTarget.field)===refKey(column.field));
      if(already)continue;
      const phaseTarget={table:table.id,field:{...column.field}},defaultStep:TableMigrationStepDraft={id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' SET DEFAULT '+typedDefaultExpressionSql(mapping.default),phaseOperation:'install-default',phaseTarget,operation:'install-default'};
      steps.push(internalFieldEffect(defaultStep,'install-default',phaseTarget));
     }
     const checkPaths=changes.checkPaths.get(tableIndex);
     for(const check of changes.checkChanges.get(tableIndex)??[]){
      const path=checkPaths?.get(check.name)??'/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/checks/'+next.expectedCatalog.tables[tableIndex]!.checks.findIndex(c=>c.id===check.id);
      const selected=options?.validations?.some(item=>item.table===table.id&&item.constraint===check.id&&item.kind==='check')??false;
      const appendedTarget=options?.version==='umf.table-migration-options/0.6'
       ?next.expectedCatalog.columns.find(column=>column.table===table.id&&!previous.expectedCatalog.columns.some(old=>old.table===table.id&&refKey(old.field)===refKey(column.field))&&path===column.sourcePath+'/domain')
       :(options?.version==='umf.table-migration-options/0.4'&&options.backfills.find(item=>item.table===table.id&&!previous.expectedCatalog.columns.some(old=>old.table===table.id&&refKey(old.field)===refKey(item.column))&&path===next.expectedCatalog.columns.find(column=>column.table===table.id&&refKey(column.field)===refKey(item.column))?.sourcePath+'/domain'));
      const phaseField=options?.version==='umf.table-migration-options/0.6'?(appendedTarget as TableMigrationStep['phaseTarget']|undefined)?.field:(appendedTarget as {table:string;column:TableRef}|undefined)?.column;
      const phaseTarget=phaseField?{table:table.id,field:{...phaseField}}:undefined;
      const isG11=options?.version==='umf.table-migration-options/0.6',targetCheck=!!phaseTarget&&isG11,legacyG02TargetCheck=!!phaseTarget&&options?.version==='umf.table-migration-options/0.4';
      const checkSubject=targetCheck?undefined:isG11?g11DependencySubject(next,table.id,'check',check.id,path):undefined;
      const fieldMapping=phaseTarget?table.columns.find(c=>refKey(c.field)===refKey(phaseTarget.field)):undefined,renderedTarget=(targetCheck||legacyG02TargetCheck)&&fieldMapping?renderG02FieldEffect({role:'target-check',schema:next.configuration.schema,table:table.id,tableName:table.name,column:fieldMapping,sourcePath:path,field:phaseTarget!.field,notValid:selected,checkDefinitionSql:check.definitionSql}):undefined,checkStep:TableMigrationStepDraft={id:'',kind:'table',sourcePath:path,transaction:'required',sql:renderedTarget?.sql??'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ADD '+check.definitionSql+(selected?' NOT VALID':''),...(selected?{operation:'add-not-valid',constraintKind:'check' as const}:{}),...(targetCheck?{phaseOperation:'target-check' as const,phaseTarget,operation:'target-check'}:checkSubject?{phaseOperation:'dependency-add' as const,phaseDependency:checkSubject,operation:'dependency-add'}:phaseTarget?{phaseOperation:'target-check' as const,phaseTarget}:{})};
      steps.push(phaseTarget&&(isG11||legacyG02TargetCheck)?internalFieldEffect(checkStep,'target-check',phaseTarget):checkSubject?internalDependencyEffect(checkStep,'dependency-add',checkSubject):checkStep);
      if(selected){const renderedValidation=phaseTarget&&(isG11||legacyG02TargetCheck)&&fieldMapping?renderG02FieldEffect({role:'validate-target-check',schema:next.configuration.schema,table:table.id,tableName:table.name,column:fieldMapping,sourcePath:path,field:phaseTarget.field,constraintName:check.name}):undefined;steps.push({id:'',kind:'table',sourcePath:path,transaction:'required',sql:renderedValidation?.sql??'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' VALIDATE CONSTRAINT '+quoteIdentifier(check.name),operation:'validate',constraintKind:'check'});}
     }
     continue;
    }
    if(step.kind==='comment'){
     if(!previous.steps.some(old=>old.kind==='comment'&&old.sourcePath===step.sourcePath&&old.sql===step.sql))steps.push(step);
     continue;
    }
    if(step.kind==='foreignKey'&&options){
     const idx=Number(parts[8]),fk=next.expectedCatalog.tables[tableIndex]!.foreignKeys[idx]!;
     const oldForeignKeys=previous.expectedCatalog.tables[tableIndex]!.foreignKeys;
     const isNewStableId=!oldForeignKeys.some(old=>old.id===fk.id),replaced=changes.foreignKeyChanges.get(tableIndex)?.replacements.has(fk.id)??false;
     if(isNewStableId||replaced){
      const selected=options.validations?.some(item=>item.table===next.expectedCatalog.tables[tableIndex]!.id&&item.constraint===fk.id&&item.kind==='foreignKey')??false;
      const g11=options.version==='umf.table-migration-options/0.6',sourcePath=g11?g11DependencyPath(next,next.expectedCatalog.tables[tableIndex]!.id,'foreignKey',fk.id):step.sourcePath;
      const subject=g11?g11DependencySubject(next,next.expectedCatalog.tables[tableIndex]!.id,'foreignKey',fk.id,sourcePath):undefined;
      if(g11&&!subject)throw new Error('G11_DEPENDENCY_SUBJECT');
      const sql:TableMigrationStepDraft=selected?{...step,sql:step.sql+' NOT VALID',operation:'add-not-valid',constraintKind:'foreignKey'}:subject?{...step,sourcePath,operation:'dependency-add',phaseOperation:'dependency-add',phaseDependency:subject}:{...step};
      steps.push(subject?internalDependencyEffect(sql,'dependency-add',subject):sql);
      if(selected)steps.push({id:'',kind:'foreignKey',sourcePath:step.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(next.expectedCatalog.tables[tableIndex]!.name)+' VALIDATE CONSTRAINT '+quoteIdentifier(fk.name),operation:'validate',constraintKind:'foreignKey'});
      continue;
     }
    }
    if(step.kind==='index'&&parts[7]==='indexes'&&/^\d+$/.test(parts[8]??'')){
     const index=next.expectedCatalog.tables[tableIndex]!.indexes[Number(parts[8])]!,oldIndexes=previous.expectedCatalog.tables[tableIndex]!.indexes;
     if(!oldIndexes.some(old=>old.id===index.id)||changes.indexChanges.get(tableIndex)?.replacements.has(index.id)){
      if(options?.version==='umf.table-migration-options/0.6'){const sourcePath=g11DependencyPath(next,next.expectedCatalog.tables[tableIndex]!.id,'index',index.id),subject=g11DependencySubject(next,next.expectedCatalog.tables[tableIndex]!.id,'index',index.id,sourcePath);steps.push(internalDependencyEffect({...step,sourcePath,operation:'dependency-add',phaseOperation:'dependency-add',phaseDependency:subject},'dependency-add',subject));}else steps.push(step);continue;
     }
    }
    if(step.kind==='policy'){
     const table=next.expectedCatalog.tables[tableIndex]!,audience=parts[8] as PolicyAudience,command=parts[9] as PolicyCommand;
     if(!['person','batch'].includes(audience)||!['select','insert','update','delete'].includes(command))fail('Unexpected compiler policy source path',step.sourcePath);
     if(changes.policyChanges.has(step.sourcePath)){
      if(options?.version==='umf.table-migration-options/0.6'){
       const relation=quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name),name='umf_'+audience+'_'+command;
       const beforeSubject=g11DependencySubject(previous!,table.id,'policy','',step.sourcePath),afterSubject=g11DependencySubject(next,table.id,'policy','',step.sourcePath);
       steps.push(internalDependencyEffect({id:'',kind:'policy',sourcePath:step.sourcePath,transaction:'required',sql:'DROP POLICY '+quoteIdentifier(name)+' ON '+relation,phaseOperation:'dependency-drop',phaseDependency:beforeSubject,operation:'dependency-drop'},'dependency-drop',beforeSubject));
       steps.push(internalDependencyEffect({...step,id:'',operation:'dependency-add',phaseOperation:'dependency-add',phaseDependency:afterSubject},'dependency-add',afterSubject));
      }else{
       const altered={...step,id:'',sql:alterPolicySql(step,table,next.configuration,audience,command)};
       steps.push(options?.version==='umf.table-migration-options/0.4'?internalPolicyEffect(altered,previous!,next,table.id,step.sourcePath):altered);
      }
     }
     const change=changes.grantChanges.get(step.sourcePath);
     if(change&&change.next.length===0){addRevokes(step.sourcePath,tableIndex);emittedGrantChanges.add(step.sourcePath);}
     continue;
    }
    if(step.kind==='grant'){
     const change=changes.grantChanges.get(step.sourcePath);
     if(change){
      if(!emittedGrantChanges.has(step.sourcePath)){
       addRevokes(step.sourcePath,tableIndex);
       for(const grant of change.next){
        if(options?.version==='umf.table-migration-options/0.6'){
         const subject=g11DependencySubject(next,next.expectedCatalog.tables[tableIndex]!.id,'grant','',step.sourcePath);
         steps.push(internalGrantEffect({...grant,operation:'dependency-add',phaseOperation:'dependency-add',phaseDependency:subject},'grant-add',next,next.expectedCatalog.tables[tableIndex]!.id,step.sourcePath));
        }else steps.push(options?.version==='umf.table-migration-options/0.4'?internalGrantEffect(grant as LegacyTableMigrationStep,'grant-add',next,next.expectedCatalog.tables[tableIndex]!.id,step.sourcePath):grant);
       }
       emittedGrantChanges.add(step.sourcePath);
      }
     }
    }
   }
  }
  if(previous)for(const comment of previous.expectedCatalog.comments??[]){
   if(next.expectedCatalog.comments?.some(fresh=>fresh.table===comment.table&&fresh.column===comment.column))continue;
   if(comment.column!==undefined&&changes.renamedColumns.get(next.expectedCatalog.tables.findIndex(table=>table.id===comment.table))?.some(rename=>rename.old.name===comment.column))continue;
   if(comment.column!==undefined&&changes.droppedColumns.has(next.expectedCatalog.tables.findIndex(table=>table.id===comment.table))&&changes.droppedColumns.get(next.expectedCatalog.tables.findIndex(table=>table.id===comment.table))!.some(column=>column.name===comment.column))continue;
   const table=next.expectedCatalog.tables.find(t=>t.id===comment.table)!;
   const target=quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+(comment.column===undefined?'':'.'+quoteIdentifier(comment.column));
   steps.push({id:'',kind:'comment',sourcePath:'/next/expectedCatalog/comments',transaction:'required',sql:'COMMENT ON '+(comment.column===undefined?'TABLE ':'COLUMN ')+target+' IS NULL'});
  }
  const deferredColumnDrops:typeof steps=[];
  for(const[tableIndex,columns]of changes.droppedColumns){const table=next.expectedCatalog.tables[tableIndex]!;for(const column of columns){const phaseTarget={table:table.id,field:{...column.field}},step:TableMigrationStepDraft={id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' DROP COLUMN '+quoteIdentifier(column.name),...(options?.version==='umf.table-migration-options/0.6'?{phaseOperation:'drop-column' as const,phaseTarget,operation:'drop-column'}:{})};deferredColumnDrops.push(options?.version==='umf.table-migration-options/0.6'?internalFieldEffect(step,'drop-column',phaseTarget):step);}}
  steps.push(...deferredColumnDrops);
  if(steps.length>8192)fail('Migration step count exceeds8192','/steps');
  const stepIds=new Set(steps.filter(step=>step.id).map(step=>step.id));let syntheticId=90000;
  for(const step of steps)if(!step.id){while(stepIds.has('step-'+String(syntheticId).padStart(5,'0')))syntheticId++;step.id='step-'+String(syntheticId++).padStart(5,'0');stepIds.add(step.id);}
  if(previous&&!steps.length&&!commandOnly(previous,next))fail('A plan without DDL may change only declared commands or source serialization','/next/source');
  const oldSeeds=previous?.seedSets??[];
  if(options?.version==='umf.table-migration-options/0.6'&&!same(oldSeeds,next.seedSets))fail('G11 keeps authored seedSets byte-meaning unchanged and never replays or edits seed history','/next/seedSets');
  const retainedSeeds=copyJson(oldSeeds) as unknown as typeof oldSeeds;
  const removedRefs=new Set(Array.from(changes.droppedColumns.values()).flat().map(column=>refKey(column.field)));
  if(options?.version!=='umf.table-migration-options/0.6'&&removedRefs.size)for(const set of retainedSeeds)for(const row of set.rows)row.values=row.values.filter(value=>!removedRefs.has(refKey(value.field)));
  if(!same(retainedSeeds,next.seedSets.slice(0,oldSeeds.length)))fail(options?.version==='umf.table-migration-options/0.6'?'G11 requires complete retained seedSets to remain unchanged and never replay':'Existing seed sets are immutable except removal of reviewed dropped-column seed values','/next/seedSets');
  const addedSeeds=next.seedSets.slice(oldSeeds.length);
  if(addedSeeds.length&&(next.source.format!=='json'||addedSeeds.length>128||addedSeeds.some(s=>new TextEncoder().encode(s.id).length>256)||addedSeeds.reduce((n,s)=>n+s.rows.length,0)>10000))fail('Native seeds require JSON source, at most128 new sets/10000 rows, and256-byte IDs','/next/seedSets');
  const seedExecution:TableMigrationPlan['seedExecution']=addedSeeds.length?{version:'umf.table-seed-execution/0.1',sets:addedSeeds.map(s=>s.id)}:'none';
  if(options?.version==='umf.table-migration-options/0.4'){
   if(options.backfills.length!==1||options.concurrentIndexes.length||options.validations?.length||addedSeeds.length)fail('G02 admits one isolated derived backfill without concurrent indexes, deferred validations or seeds','/options');
   const target=options.backfills[0]!,appended=!previous!.expectedCatalog.columns.some(column=>column.table===target.table&&refKey(column.field)===refKey(target.column));
   if(appended){
    const targetKey=JSON.stringify([target.table,target.column.module,target.column.element]);
    const selected=steps.map((step,index)=>({step,index})).filter(({step})=>step.phaseTarget&&JSON.stringify([step.phaseTarget.table,step.phaseTarget.field.module,step.phaseTarget.field.element])===targetKey);
    const add=selected.find(({step})=>step.phaseOperation==='add-column');
    const fill=selected.find(({step})=>step.phaseOperation==='backfill');
    const tighten=selected.find(({step})=>step.phaseOperation==='tighten-not-null');
    const checks=selected.filter(({step})=>step.phaseOperation==='target-check');
    const futureDefault=selected.filter(({step})=>step.phaseOperation==='install-default');
    if(!add||!fill||!tighten||futureDefault.length>1||selected.length!==1+checks.length+1+futureDefault.length+1)fail('Appended required-field backfill must contain only its nullable add, target domain checks, derived fill, optional default and tightening','/options/backfills/0');
    const group=[add!.step,...checks.map(item=>item.step),fill!.step,...futureDefault.map(item=>item.step),tighten!.step];
    const first=Math.min(...selected.map(item=>item.index)),insertion=steps.slice(0,first).filter(step=>!selected.some(item=>item.step===step)).length;
    for(const item of selected)steps.splice(steps.indexOf(item.step),1);
    steps.splice(insertion,0,...group);
    const relatedPolicyGrants=steps.filter(step=>!group.includes(step)&&step.kind==='grant'&&/\/policy\/person\/update$/.test(step.sourcePath));
    if(steps.length!==group.length+relatedPolicyGrants.length||steps.some(step=>!group.includes(step)&&!relatedPolicyGrants.includes(step))||relatedPolicyGrants.some(step=>step.transaction!=='required'))fail('Appended required-field backfill cannot include unrelated migration effects','/options');
   }else{
    if(steps.length!==2||steps[0]?.phaseOperation!=='backfill'||steps[1]?.phaseOperation!=='tighten-not-null')fail('Existing-field derived fill and NOT NULL tightening must be the only migration effects','/options/backfills');
   }
  }
  const existingG01Fills=options?.version==='umf.table-migration-options/0.3'?options.backfills.filter(backfill=>previous?.expectedCatalog.columns.some(column=>column.table===backfill.table&&refKey(column.field)===refKey(backfill.column))):[];
  if(existingG01Fills.length){
   const selected=existingG01Fills[0]!,oldDocument=readDocument(previous!.source.utf8,previous!.source.format),newDocument=readDocument(next.source.utf8,next.source.format);
   const nextField=newDocument.modules.find(module=>module.id===selected.column.module)?.elements.find(element=>element.id===selected.column.element);
   if(nextField?.kind==='field')nextField.nullability='absent-allowed';
   const oldPayload=oldDocument.modules.find(module=>module.id===selected.column.module)?.extensions?.['umf.tables'] as {commands?:{id:string}[]}|undefined;
   const newPayload=newDocument.modules.find(module=>module.id===selected.column.module)?.extensions?.['umf.tables'] as {commands?:{id:string}[]}|undefined;
   if(oldPayload?.commands)oldPayload.commands=oldPayload.commands.filter(command=>command.id!==selected.operation);
   if(newPayload?.commands)newPayload.commands=newPayload.commands.filter(command=>command.id!==selected.operation);
   const oldCatalog=copyJson(previous!.expectedCatalog) as any,newCatalog=copyJson(next.expectedCatalog) as any;
   for(const catalog of [oldCatalog,newCatalog]){const column=catalog.columns.find((item:any)=>item.table===selected.table&&refKey(item.field)===refKey(selected.column));if(column){delete column.nullable;delete column.definitionSql;delete column.sourcePath;}}
   const marker=options!.reviewedChanges?.filter(item=>item.kind==='tighten-not-null'&&item.path===next.expectedCatalog.columns.find(column=>column.table===selected.table&&refKey(column.field)===refKey(selected.column))?.sourcePath)??[];
   if(existingG01Fills.length!==1||options!.backfills.length!==1||options!.concurrentIndexes.length||options!.validations?.length||options!.reviewedChanges?.length!==1||marker.length!==1||addedSeeds.length||seedExecution!=='none'||!same(oldDocument,newDocument)||!same(oldCatalog,newCatalog)||steps.length!==2||steps[0]?.phaseOperation!=='backfill'||steps[1]?.phaseOperation!=='tighten-not-null')fail('Existing-field fill and NOT NULL tightening must be the only source and migration effect in this profile','/options/backfills');
  }
  if(options?.concurrentIndexes.length){
   const docs=[previous!,next].map(bundle=>readDocument(bundle.source.utf8,bundle.source.format));
   for(const doc of docs){const m=doc.modules.find(m=>m.id===next.module)!;const p=m.extensions!['umf.tables'] as unknown as {tables:{indexes:unknown[]}[]};for(const t of p.tables)t.indexes=[];}
   if(options.version==='umf.table-migration-options/0.1'&&!same(docs[0],docs[1]))fail('Concurrent phases may change only index declarations','/options/concurrentIndexes');
   if(options.version==='umf.table-migration-options/0.1'&&(addedSeeds.length||options.backfills.length))fail('Legacy concurrent indexes cannot share a migration with seeds or backfills','/options/concurrentIndexes');
   const selected=new Set(options.concurrentIndexes.map(selection=>{const table=next.expectedCatalog.tables.findIndex(t=>t.id===selection.table),index=next.expectedCatalog.tables[table]!.indexes.findIndex(i=>i.id===selection.index);return table+':'+index;}));
   if(options.version==='umf.table-migration-options/0.1'&&steps.some(step=>step.kind!=='index'))fail('Legacy concurrent-index plans must contain indexes only','/options/concurrentIndexes');
   for(const [i,step]of steps.entries()){
    if(step.kind!=='index')continue;
    const parts=step.sourcePath.split('/');
    if(selected.has(parts[6]+':'+parts[8]))steps[i]={...step,transaction:'forbidden',sql:step.sql.replace(/^(CREATE (?:UNIQUE )?INDEX) /,'$1 CONCURRENTLY ')};
    else if(options.version==='umf.table-migration-options/0.1')fail('Every index in this legacy phase must be explicitly selected as concurrent','/options/concurrentIndexes');
   }
  }
  const review:MigrationReview[]=options?[...options.backfills.map((_,i)=>({code:'SCOPED_BACKFILL' as const,path:'/options/backfills/'+i,message:'Administrative UPDATE may touch protected rows; exact source and effect bound require approval'})),...Array.from(changes.policyChanges,path=>({code:'POLICY_CHANGE_REVIEW' as const,path,message:'Changed row predicate may widen access; review old and new command policy'})),...Array.from(changes.droppedColumns.values()).flat().map(column=>({code:'IRREVERSIBLE_COLUMN_PURGE' as const,path:column.sourcePath,message:'Irreversible purge of stored values for Field '+column.field.module+'.'+column.field.element+' at table '+column.table+'.'+column.name+'. Metadata history is not a data backup; this profile performs immediate physical deletion.'}))]:[];
  let migrationSteps:LegacyTableMigrationStep[]=steps.map(step=>({...step,
   preconditions:{phase:'before-plan',kind:previous?'installed-source-cohort':'empty-private-schema',bundleDigest:previous?.bundleDigest??null},
   expectedOutcome:{phase:'before-commit',kind:'complete-next-source-catalog',bundleDigest:next.bundleDigest},
   verification:'native-catalog-privileges-and-role-scope',recovery:step.transaction==='forbidden'?'inspect-index':'rollback-transaction'}));
  if(options?.version==='umf.table-migration-options/0.6'){
   migrationSteps=g11PhaseSteps(migrationSteps,previous!,next,options);
   if(migrationSteps.length>99999)fail('G11 ordered migration steps exceed identifier capacity','/steps');
   migrationSteps.forEach((step,index)=>{step.id='step-'+String(index+1).padStart(5,'0');});
  }
  const migrationVersion=options?.version==='umf.table-migration-options/0.6'?'umf.table-migration/0.6' as const:options?.version==='umf.table-migration-options/0.4'?'umf.table-migration/0.4' as const:options?.version==='umf.table-migration-options/0.3'?'umf.table-migration/0.3' as const:options?.version==='umf.table-migration-options/0.2'?'umf.table-migration/0.2' as const:'umf.table-migration/0.1' as const;
  const phased=migrationVersion==='umf.table-migration/0.1'?undefined:phaseTableMigrationSteps(migrationSteps,previous,next,options,seedExecution);
  if(phased)migrationSteps=phased.steps as LegacyTableMigrationStep[];
  const internalOperationTags=new Map<string,TableMigrationOperationTag>();
  for(const step of migrationSteps){
   const tagged=step as TableMigrationStep&{[TABLE_MIGRATION_OPERATION]?:TableMigrationOperationTag},tag=tagged[TABLE_MIGRATION_OPERATION];
   if(tag&&captureInternalOperations)internalOperationTags.set(step.id,tag);
   if(tag)delete tagged[TABLE_MIGRATION_OPERATION];
  }
  const body={version:migrationVersion,canonicalization:'RFC8785' as const,id:request.id,predecessor:request.predecessor,previous,next,fromBundleDigest:previous?.bundleDigest??null,toBundleDigest:next.bundleDigest,steps:migrationSteps,seedExecution,...(phased?{phases:phased.phases,executionProfile:phased.executionProfile}:{}),...(migrationVersion==='umf.table-migration/0.3'||migrationVersion==='umf.table-migration/0.4'||migrationVersion==='umf.table-migration/0.6'?{approvalProfile:{version:'umf.table-migration-approval/0.1' as const,relation:'umf_lifecycle_approvals' as const,ownerOnly:true as const}}:{}),...(options?{options,review}:{}),requiresApproval:true as const,nativeQualified:false as const};
  if(new TextEncoder().encode(canonical(body)).length>24_000_000)fail('Migration plan exceeds24MB');
  const plan=copyJson({...body,digest:hashCanonical(body)}) as unknown as TableMigrationPlan;
  if(captureInternalOperations){
   const copiedSteps=new Map(plan.steps.map(step=>[step.id,step]));
   for(const[stepId,tag]of internalOperationTags){
    const copied=copiedSteps.get(stepId);
    if(tag&&copied)Object.defineProperty(copied,TABLE_MIGRATION_OPERATION,{value:tag,enumerable:true,configurable:true});
   }
  }
  return {status:'compiled',plan,diagnostics:[]};
 }catch(error){
  if(error instanceof UmfError)return {status:'blocked',diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
  if(error instanceof Error&&['INPUT','LIMIT'].includes(error.message))return {status:'blocked',diagnostics:[{code:'TABLE_MIGRATION_INPUT',path:'',message:'Invalid Unicode or resource limit',severity:'error'}]};
  throw error;
 }
}

function compileG03DefaultChangePlan(request:TableMigrationRequest,previous:TableDeploymentBundle,next:TableDeploymentBundle,options:LegacyTableMigrationOptions,captureInternalOperations=false):TableMigrationResult{
 const candidate=validateG03DefaultChange(previous,next,options.reviewedChanges),match=/^\/modules\/(\d+)\/extensions\/umf\.tables\/tables\/(\d+)\/columns\/(\d+)\/default$/.exec(candidate.path);
 if(!match)fail('G03 marker path is not a selected native default','/options/reviewedChanges/0/path');
 const doc=readDocument(next.source.utf8,'json'),module=doc.modules[Number(match![1])]!,table=(module.extensions!['umf.tables'] as any).tables[Number(match![2])]!,column=table.columns[Number(match![3])]!;
 const field={module:column.field.module,element:column.field.element},phaseTarget={table:table.id,field};
 const relation=quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name),target=quoteIdentifier(column.name);
 const defaultExpression=Object.hasOwn(column,'default')?typedDefaultExpressionSql(column.default):undefined;
 if(defaultExpression!==undefined&&new TextEncoder().encode(defaultExpression).length>1_048_576)fail('G03 rendered default expression exceeds 1 MiB UTF-8',candidate.path);
 const sql=defaultExpression!==undefined
  ?'ALTER TABLE '+relation+' ALTER COLUMN '+target+' SET DEFAULT '+defaultExpression
  :'ALTER TABLE '+relation+' ALTER COLUMN '+target+' DROP DEFAULT';
 if(new TextEncoder().encode(sql).length>1_049_600)fail('G03 ALTER statement exceeds 1,049,600 UTF-8 bytes',candidate.path);
 const step:LegacyTableMigrationStep={id:'step-00001',kind:'table',sourcePath:candidate.path,transaction:'required',sql,operation:Object.hasOwn(column,'default')?'set-default':'drop-default',phaseOperation:'change-default',phaseTarget,
  preconditions:{phase:'before-plan',kind:'installed-source-cohort',bundleDigest:previous.bundleDigest},
  expectedOutcome:{phase:'before-commit',kind:'complete-next-source-catalog',bundleDigest:next.bundleDigest},
  verification:'native-catalog-privileges-and-role-scope',recovery:'rollback-transaction'};
 const operationTag:TableMigrationOperationTag|undefined=captureInternalOperations?{profile:'umf.table-migration-renderer-operation/0.1',role:'change-default',sourcePath:candidate.path,subject:{type:'field',table:table.id,field}}:undefined;
 const phased=phaseTableMigrationSteps([step],previous,next,options,'none');
 const body={version:'umf.table-migration/0.5' as const,canonicalization:'RFC8785' as const,id:request.id,predecessor:request.predecessor,previous,next,
  fromBundleDigest:previous.bundleDigest,toBundleDigest:next.bundleDigest,steps:phased.steps,seedExecution:'none' as const,
  phases:phased.phases,executionProfile:phased.executionProfile,
  approvalProfile:{version:'umf.table-migration-approval/0.1' as const,relation:'umf_lifecycle_approvals' as const,ownerOnly:true as const},
  options,review:[],requiresApproval:true as const,nativeQualified:false as const};
 if(new TextEncoder().encode(canonical(body)).length>24_000_000)fail('Migration plan exceeds24MB');
 const plan=copyJson({...body,digest:hashCanonical(body)}) as unknown as TableMigrationPlan;
 if(operationTag)Object.defineProperty(plan.steps[0]!,TABLE_MIGRATION_OPERATION,{value:operationTag,enumerable:true,configurable:true});
 return {status:'compiled',plan,diagnostics:[]};
}

export function compileTableMigration(input:Omit<TableMigrationRequest,'options'>&{options:G04MigrationOptions}):G04TableMigrationResult;
export function compileTableMigration(input:Omit<TableMigrationRequest,'options'>&{options?:LegacyTableMigrationOptions}):LegacyTableMigrationResult;
export function compileTableMigration(input:TableMigrationRequest):TableMigrationResult;
export function compileTableMigration(input:TableMigrationRequest):TableMigrationResult{
 return compileTableMigrationInternal(input,false,hasTableMigrationOperationCapture(input));
}

/** Source recompilation verifies complete plans, even after untrusted rehashing. */
export function verifyTableMigration(input:unknown):TableMigrationPlan{
 const value=copyJson(input) as unknown as TableMigrationPlan;
 if(!value||!['umf.table-migration/0.1','umf.table-migration/0.2','umf.table-migration/0.3','umf.table-migration/0.4','umf.table-migration/0.5','umf.table-migration/0.6','umf.table-migration/0.7'].includes(value.version))fail('Unknown migration plan');
 const result=compileTableMigrationInternal({id:value.id,predecessor:value.predecessor,previous:value.previous,next:value.next,...(value.options?{options:value.options}:{})},value.version==='umf.table-migration/0.1');
 if(result.status!=='compiled')return fail('Migration differs from exact source recompilation');
 if(!same(value,result.plan))fail('Migration differs from exact source recompilation');
 return result.plan;
}

// G10 portable inventory API. These names are deliberately distinct from the
// legacy .1–.6 table-migration entrypoints above.
export {compileTableInventoryMigration,discoverTableInventoryMigrationChanges,verifyTableInventoryMigration,serializeTableInventoryMigration} from './inventory';
export type {TableInventoryMigrationPlan,TableInventoryMigrationResult,TableInventoryMigrationStep,TableInventoryMigrationPhase,TableInventoryExecutionProfile,TableInventoryPlanInventory} from './inventory';
export type {TableInventoryMigrationRequest,TableInventoryMigrationOptions,TableInventoryDiscoverySelector,TableInventorySourceHistory,TableInventoryHistoryPlan,TableInventoryHistoryExecution,TableInventorySeedOutcome,TableInventoryReviewedChangeKind,TableInventoryMigrationMarker,TableInventoryTableIntent,TableInventoryDiscoveryIntent,TableInventoryDiscoveryConversion,TableInventoryConversion,TableInventoryRetirement,TableInventoryRestoration,TableInventoryArchiveSource} from './inventory-options';
export type {TableInventoryReviewedChangeCandidate,TableInventoryTableReview,TableInventoryTableReviewEffects,TableInventorySeedReview,TableInventoryReviewValue} from './inventory-review';
export {irreversiblePurgeDisclosure} from './inventory-review';
