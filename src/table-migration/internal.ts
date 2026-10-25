// SPDX-License-Identifier: MIT OR Apache-2.0
import {compileTableMigration,type TableMigrationRequest,type TableMigrationResult,type TableMigrationStep} from './index';
import {requestTableMigrationOperationCapture,TABLE_MIGRATION_OPERATION,type TableMigrationOperationRecord,type TableMigrationOperationTag} from './internal-operations';
import {hashCanonical,hashCanonicalCharged} from '../compilation/bundle/hash';
import type {AccountingContext} from '../model/internal/accounting-context';
import {copyJsonCharged} from '../model/json';
import {readJsonDocumentWithAccounting} from '../model/document-accounting';
import {migrationOptionsForInventoryComposition,refKey,type TableMigrationOptions} from './options';
import {verifyTableDeployment,verifyTableDeploymentWithAccounting,type TableDeploymentBundle} from '../table-deployment';
import {readDocument} from '../model/document';
import {tableMigrationFieldOperationTag} from './internal-operations';
import {renderG02FieldEffect,type G02FieldEffect,type G02FieldEffectRole} from './g02-field-effects';

const roleByPhase={
 'add-column':'add-column','backfill':'backfill','target-check':'target-check','install-default':'install-default',
 'tighten-not-null':'tighten-not-null','change-default':'change-default','drop-column':'drop-column',
 'dependency-add':'dependency-add','dependency-drop':'dependency-drop',
} as const;
function exactKeys(value:object,keys:readonly string[]):boolean{
 const actual=Object.keys(value).sort(),expected=[...keys].sort();return actual.length===expected.length&&actual.every((key,index)=>key===expected[index]);
}
function without(value:object,keys:readonly string[]):Record<string,unknown>{return Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));}
function same(left:unknown,right:unknown,accounting?:AccountingContext,path='/g02'):boolean{return (accounting?hashCanonicalCharged(left,accounting,`${path}/left`):hashCanonical(left))===(accounting?hashCanonicalCharged(right,accounting,`${path}/right`):hashCanonical(right));}

function validateTag(step:TableMigrationStep,tag:TableMigrationOperationTag,optionsVersion:string):void{
 if(!exactKeys(tag,Object.hasOwn(tag,'rowOperationId')?['profile','role','sourcePath','subject','rowOperationId']:['profile','role','sourcePath','subject'])||tag.profile!=='umf.table-migration-renderer-operation/0.1'||tag.sourcePath!==step.sourcePath||!step.id)throw new Error('table-migration-internal-operation-binding');
 if(tag.subject.type==='field'){
  if(!exactKeys(tag.subject,['type','table','field'])||!exactKeys(tag.subject.field,['module','element']))throw new Error('table-migration-internal-field-shape');
  const phase=step.phaseOperation;
  const expectedStepKind=phase==='backfill'?'backfill':'table',expectedOperation=phase==='change-default'?step.operation:phase;
  if(!phase||step.phaseDependency||!step.phaseTarget||phase==='dependency-add'||phase==='dependency-drop'||tag.subject.table!==step.phaseTarget.table||tag.subject.field.module!==step.phaseTarget.field.module||tag.subject.field.element!==step.phaseTarget.field.element||tag.role!==roleByPhase[phase]||step.kind!==expectedStepKind||phase==='backfill'&&(step.sql!==''||tag.rowOperationId!==step.operation)||phase!=='backfill'&&tag.rowOperationId!==undefined||optionsVersion==='umf.table-migration-options/0.6'&&phase!=='change-default'&&step.operation!==expectedOperation||phase==='change-default'&&!['set-default','drop-default'].includes(step.operation??''))throw new Error('table-migration-internal-field-binding');
  return;
 }
 if(tag.subject.type==='dependency'){
  if(!exactKeys(tag.subject,['type','table','kind','id','sourcePath','meaningDigest']))throw new Error('table-migration-internal-dependency-shape');
  const phase=step.phaseOperation,expectedRole=phase==='dependency-add'?'dependency-add':phase==='dependency-drop'?'dependency-drop':undefined,dependency=step.phaseDependency;
  const expectedKind=dependency?.kind==='foreignKey'?'foreignKey':dependency?.kind==='index'?'index':dependency?.kind==='policy'?'policy':'table';
  if(!expectedRole||!dependency||!step.phaseDependency||dependency.kind==='grant'||tag.role!==expectedRole||dependency.table!==tag.subject.table||dependency.kind!==tag.subject.kind||dependency.id!==tag.subject.id||dependency.sourcePath!==tag.subject.sourcePath||dependency.meaningDigest!==tag.subject.meaningDigest||step.kind!==expectedKind||step.operation!==expectedRole)throw new Error('table-migration-internal-dependency-binding');
  return;
 }
 if(tag.subject.type==='grant-group'){
  if(!exactKeys(tag.subject,Object.hasOwn(tag.subject,'dependencyMeaningDigest')?['type','table','sourcePath','rendererStepId','rows','meaningDigest','dependencyMeaningDigest']:['type','table','sourcePath','rendererStepId','rows','meaningDigest'])||!Array.isArray(tag.subject.rows))throw new Error('table-migration-internal-grant-shape');
  const phase=step.phaseOperation,expectedRole=phase==='dependency-add'?'grant-add':phase==='dependency-drop'?'grant-revoke':tag.role==='grant-add'||tag.role==='grant-revoke'?tag.role:undefined;
  const digest=hashCanonical({version:'umf.table-migration-grant-group/0.1',rows:tag.subject.rows});
  if(!expectedRole||tag.role!==expectedRole||step.phaseDependency&&(step.phaseDependency.kind!=='grant'||tag.subject.table!==step.phaseDependency.table||tag.subject.dependencyMeaningDigest!==step.phaseDependency.meaningDigest)||!step.phaseDependency&&tag.subject.dependencyMeaningDigest!==undefined||tag.subject.sourcePath!==step.sourcePath||tag.subject.meaningDigest!==digest||tag.subject.rows.length!==1||step.kind!=='grant'||optionsVersion==='umf.table-migration-options/0.6'&&phase==='dependency-add'&&step.operation!=='dependency-add'||optionsVersion==='umf.table-migration-options/0.6'&&phase==='dependency-drop'&&step.operation!=='dependency-drop')throw new Error('table-migration-internal-grant-binding');
  const row=tag.subject.rows[0]!;
  const columnsValid=!!row&&typeof row==='object'&&(row.privilege==='update'?Array.isArray(row.columns)&&row.columns.length>0&&row.columns.every(column=>typeof column==='string'&&column.length>0)&&new Set(row.columns).size===row.columns.length:row.columns===null);
  if(!row||typeof row!=='object'||Array.isArray(row)||!exactKeys(row,['table','schema','relation','role','privilege','columns','grantOption'])||row.table!==tag.subject.table||typeof row.schema!=='string'||!row.schema||typeof row.relation!=='string'||!row.relation||typeof tag.subject.rendererStepId!=='string'||!tag.subject.rendererStepId||typeof row.role!=='string'||!row.role||!['select','insert','update','delete'].includes(row.privilege)||row.grantOption!==false||!columnsValid)throw new Error('table-migration-internal-grant-meaning');
  return;
 }
 if(tag.subject.type==='policy-transition'){
  if(!exactKeys(tag.subject,['type','table','sourcePath','beforeMeaningDigest','afterMeaningDigest'])||tag.role!=='policy-alter'||tag.subject.sourcePath!==step.sourcePath||step.kind!=='policy'||!tag.subject.table||!/\/policy\/(person|batch)\/(select|insert|update|delete)$/.test(tag.subject.sourcePath)||!/^[0-9a-f]{64}$/.test(tag.subject.beforeMeaningDigest)||!/^[0-9a-f]{64}$/.test(tag.subject.afterMeaningDigest))throw new Error('table-migration-internal-policy-binding');
  return;
 }
 throw new Error('table-migration-internal-unknown-subject');
}

/** Deep-module entry for compiler consumers that need the source-site effect tags. */
export function compileTableMigrationWithOperations(input:TableMigrationRequest):{result:TableMigrationResult;operations:TableMigrationOperationRecord[]}{
 const optionsVersion=input.options?.version;
 if(optionsVersion!=='umf.table-migration-options/0.4'&&optionsVersion!=='umf.table-migration-options/0.5'&&optionsVersion!=='umf.table-migration-options/0.6')throw new Error('table-migration-internal-unsupported-profile');
 const request={...input};
 requestTableMigrationOperationCapture(request);
 const result=compileTableMigration(request);
 if(result.status!=='compiled')return {result,operations:[]};
 const operations:TableMigrationOperationRecord[]=[];
 const seen=new Set<string>();
 for(const step of result.plan.steps){
  const tagged=step as TableMigrationStep&{[TABLE_MIGRATION_OPERATION]?:TableMigrationOperationTag};
  const tag=tagged[TABLE_MIGRATION_OPERATION];
  if(!tag){
   if(((optionsVersion==='umf.table-migration-options/0.5'||optionsVersion==='umf.table-migration-options/0.6')&&step.phaseOperation)||(optionsVersion==='umf.table-migration-options/0.4'&&request.previous!==null))throw new Error('table-migration-internal-missing-effect-tag');
   continue;
  }
  validateTag(step,tag,optionsVersion);
  if(seen.has(step.id))throw new Error('table-migration-internal-duplicate-effect-tag');
  seen.add(step.id);
  operations.push({...tag,stepId:step.id});
  delete tagged[TABLE_MIGRATION_OPERATION];
 }
 if(result.plan.steps.length!==operations.length)throw new Error('table-migration-internal-incomplete-effect-coverage');
 return {result,operations};
}

/**
 * Construct inert G02 effects for a retained or appended Field while G10 composes
 * selected table creates in the same complete source pair. This deliberately
 * does not create or verify a legacy migration plan. G10 independently verifies
 * the complete source bundles and exact create intents; this function validates
 * the unchanged G02 .4 contract against those same original bundles.
 */
export function compileG02FieldEffects(input:{previous:TableDeploymentBundle;next:TableDeploymentBundle;options:TableMigrationOptions;createdTables:readonly string[];accounting?:AccountingContext}):G02FieldEffect[]{
 const accounting=input.accounting;accounting?.visit('g02-field-effects-inputs','/g02',4);if(accounting){hashCanonicalCharged(input.previous,accounting,'/g02/previous');hashCanonicalCharged(input.next,accounting,'/g02/next');hashCanonicalCharged(input.options,accounting,'/g02/options');hashCanonicalCharged(input.createdTables,accounting,'/g02/createdTables');}
 const previous=accounting?verifyTableDeploymentWithAccounting(input.previous,accounting).bundle:verifyTableDeployment(input.previous),next=accounting?verifyTableDeploymentWithAccounting(input.next,accounting).bundle:verifyTableDeployment(input.next);
 const copiedOptions:unknown=accounting?copyJsonCharged(input.options,n=>accounting.visit('g02-options-copy','/g02/options',n),{beforeProperty:(key,path,isArray)=>{accounting.visit('g02-options-copy-property',path);if(!isArray)accounting.scanUtf8(key,path);},retainText:(text,path)=>accounting.scanUtf8(text,path)}):structuredClone(input.options);
 if(!copiedOptions||typeof copiedOptions!=='object'||Array.isArray(copiedOptions))throw new Error('table-migration-internal-g02-options');
 const options=copiedOptions as TableMigrationOptions;
 if(options.version!=='umf.table-migration-options/0.4'||input.createdTables.length>256)throw new Error('table-migration-internal-g02-profile');
 migrationOptionsForInventoryComposition(options,next,previous,input.createdTables);
 if(options.backfills.length!==1)throw new Error('table-migration-internal-g02-selection');
 const selected=options.backfills[0]!;
 const targetRef=refKey(selected.column),oldColumn=previous.expectedCatalog.columns.find(value=>value.table===selected.table&&refKey(value.field)===targetRef),columns=next.expectedCatalog.columns.filter(value=>value.table===selected.table&&refKey(value.field)===targetRef);
 if(columns.length!==1)throw new Error('table-migration-internal-g02-target-column');
 const column=columns[0]!,subjectField={module:selected.column.module,element:selected.column.element};
 const oldDocument=accounting?readJsonDocumentWithAccounting(previous.source.utf8,accounting):readDocument(previous.source.utf8,previous.source.format),nextDocument=accounting?readJsonDocumentWithAccounting(next.source.utf8,accounting):readDocument(next.source.utf8,next.source.format),nextModule=nextDocument.modules.find(module=>module.id===selected.column.module),nextField=nextModule?.elements.find(element=>element.id===selected.column.element);
 const oldField=oldDocument.modules.find(module=>module.id===selected.column.module)?.elements.find(element=>element.id===selected.column.element);
 const fieldMap=(nextModule?.extensions?.['umf.tables'] as {tables?:{id:string;columns?:{field:{module:string;element:string}}[]}[]}|undefined)?.tables?.find(table=>table.id===selected.table);
 if(!fieldMap?.columns?.some(mapping=>refKey(mapping.field)===targetRef)||nextField?.kind!=='field'||nextField.nullability!=='required')throw new Error('table-migration-internal-g02-source-target');
 const declaration=next.expectedCatalog.tables.find(value=>value.id===selected.table),mapping=declaration?.columns.find(value=>refKey(value.field)===targetRef);
 const tableName=next.expectedCatalog.tables.find(value=>value.id===selected.table)?.name;
 if(!declaration||!mapping||!tableName)throw new Error('table-migration-internal-g02-target-rendering');
 const make=(role:G02FieldEffectRole,sourcePath:string,rowOperationId?:string,checkDefinitionSql?:string):G02FieldEffect=>renderG02FieldEffect({role,schema:next.configuration.schema,table:selected.table,tableName,column:mapping,collation:column.collation,sourcePath,field:subjectField,...(rowOperationId?{rowOperationId}:{}),...(checkDefinitionSql?{checkDefinitionSql}:{})});
 const result:G02FieldEffect[]=[],targetChecks:{definitionSql:string;name:string;sourcePath:string}[]=[];
 if(!oldColumn){
  if(oldField)throw new Error('table-migration-internal-g02-target-not-new');
  result.push(make('add-column',column.sourcePath));
  const domainId='domain:'+subjectField.module+'.'+subjectField.element;
  const checks=next.expectedCatalog.checks.filter(check=>check.table===selected.table&&check.id===domainId);
  if(checks.length>1)throw new Error('table-migration-internal-g02-duplicate-domain-check');
  for(const check of checks)targetChecks.push({definitionSql:check.definitionSql,name:check.name,sourcePath:column.sourcePath+'/domain'});
 }else{
  if(!oldField||oldField.kind!=='field'||oldField.nullability!=='absent-allowed'||!same(without(oldField,['nullability']),without(nextField,['nullability']),accounting,'/g02/retained-field'))throw new Error('table-migration-internal-g02-retained-field-source');
 }
 // Match the source compiler's G02 phased plan: nullable ADD, target checks,
 // backfill, optional default, then NOT NULL tightening. The whole group is
 // one required transaction, so no intermediate nullable shape is a prefix.
 for(const check of targetChecks){
  const validate=options.validations?.some(item=>item.table===selected.table&&item.constraint==='domain:'+subjectField.module+'.'+subjectField.element&&item.kind==='check')??false;
  result.push(renderG02FieldEffect({role:'target-check',schema:next.configuration.schema,table:selected.table,tableName,column:mapping,sourcePath:check.sourcePath,field:subjectField,notValid:validate,operation:validate?'add-not-valid':'target-check',checkDefinitionSql:check.definitionSql}));
  if(validate)result.push(renderG02FieldEffect({role:'validate-target-check',schema:next.configuration.schema,table:selected.table,tableName,column:mapping,sourcePath:check.sourcePath,field:subjectField,operation:'validate',constraintName:check.name}));
 }
 result.push(make('backfill','/options/backfills/0',selected.operation));
 if(!oldColumn&&mapping.default)result.push(make('install-default',column.sourcePath));
 result.push(make('tighten-not-null',column.sourcePath));
 return result;
}
