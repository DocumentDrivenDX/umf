// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges} from '../../src/table-migration';
import {compileTableMigrationWithOperations} from '../../src/table-migration/internal';
import {validateG11SourceCorrespondence} from '../../src/table-migration/g11-source';
import {createValidator} from '../../src/validation/schema';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tablesSchema from '../../spec/extensions/tables/schema.json';
import g11MigrationSchema from '../../spec/extensions/tables/migration-0.6.schema.json';
import g11PhasesSchema from '../../spec/extensions/tables/migration-phases-0.5.schema.json';
import {sha256Text} from '../../src/compilation/bundle/hash';
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {tableOperationSource} from '../unified/table-operation-fixture';
import {legalSource} from './legal-fixture';

const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const ref=(element:string)=>({module:'demo',element});
function sourcePair(mutateNext?:(document:any)=>void,removeDefinition=false){
 const before=structuredClone(fixture) as any,after=structuredClone(fixture) as any;
 for(const doc of [before,after]){
  const module=doc.modules[0],table=module.extensions['umf.tables'].tables[0];
  module.elements.splice(module.elements.findIndex((item:any)=>item.id==='Note'),0,{id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
  module.elements.find((item:any)=>item.id==='Note').members.push(ref('summary'));
  table.columns.push({field:ref('summary'),name:'summary',nativeType:{kind:'text'}});
 }
 const oldModule=before.modules[0],newModule=after.modules[0];
 const newRecord=newModule.elements.find((item:any)=>item.id==='Note');
 newRecord.members=newRecord.members.filter((member:any)=>member.element!=='summary');
 if(removeDefinition)newModule.elements=newModule.elements.filter((item:any)=>item.id!=='summary');
 newModule.elements.push({id:'displaySummary',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 newRecord.members.push(ref('displaySummary'));
 newModule.extensions['umf.tables'].tables[0].columns=newModule.extensions['umf.tables'].tables[0].columns.filter((item:any)=>item.field.element!=='summary');
 newModule.extensions['umf.tables'].tables[0].columns.push({field:ref('displaySummary'),name:'summary',nativeType:{kind:'text'}});
 const commands=structuredClone(tableOperationSource().modules[0]!.extensions['umf.tables'].commands);
 for(const doc of [before,after])doc.modules[0].extensions['umf.tables'].commands=structuredClone(commands);
 for(const doc of [before,after])doc.modules[0].extensions['umf.tables'].commands[0]!.id='nullable_read';
 mutateNext?.(after);
 return {before,after};
}
function multipleFillRequest(){
 const {before,after}=sourcePair(undefined,true),oldModule=before.modules[0],newModule=after.modules[0],oldRecord=oldModule.elements.find((item:any)=>item.id==='Note'),newRecord=newModule.elements.find((item:any)=>item.id==='Note'),oldTable=oldModule.extensions['umf.tables'].tables[0],newTable=newModule.extensions['umf.tables'].tables[0];
 newModule.elements.find((item:any)=>item.id==='displaySummary').nullability='required';
 oldModule.elements.splice(oldModule.elements.findIndex((item:any)=>item.id==='Note'),0,{id:'caption',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 oldRecord.members.push(ref('caption'));oldTable.columns.push({field:ref('caption'),name:'caption',nativeType:{kind:'text'}});
 newModule.elements.push({id:'displayCaption',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});newRecord.members.push(ref('displayCaption'));newTable.columns.push({field:ref('displayCaption'),name:'caption',nativeType:{kind:'text'}});
 const nextPayload=newModule.extensions['umf.tables'],expression={op:'concat',args:[{op:'field',field:ref('owner')},{op:'literal',value:{string:'!'}}]};
 for(const operation of nextPayload.commands){
  if(!['insert','upsert'].includes(operation.body?.kind))continue;
  for(const field of ['displaySummary','displayCaption']){
   operation.parameters.push({id:field,field:ref(field)});
   operation.body.values.push({field:ref(field),value:{kind:'parameter',parameter:field}});
  }
 }
 const operations=['displaySummary','displayCaption'].map((field,index)=>({version:'umf.table-operation/0.2',id:'fill_'+field,parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref(field)},values:[{field:ref(field),value:{kind:'rowExpression',expression}}],returning:[],maxRows:100}}));
 nextPayload.commands.push(...operations);
 const previous=compiledBundle(before),next=compiledBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 return {id:'replacement-multiple',predecessor:{id:'replacement-001',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6' as const,backfills:['displaySummary','displayCaption'].map(field=>({table:'notes',column:ref(field),operation:'fill_'+field,scopedRows:true as const})),concurrentIndexes:[],reviewedChanges,validations:[]}};
}
function compiledBundle(document:any){
 const result=compileTableDeployment({text:JSON.stringify(document),configuration});
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 return result.bundle;
}
function compiledLegalBundle(document:any){
 const result=compileTableDeployment({text:JSON.stringify(document),configuration:{module:'legal_lifecycle',schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}}});
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 return result.bundle;
}
function request(withMarkers=true,mutateNext?:(document:any)=>void){
 const {before,after}=sourcePair(mutateNext),previous=compiledBundle(before),next=compiledBundle(after);
 const candidates=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'});
 const reviewedChanges=withMarkers?candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker):[];
 return {id:'replacement-002',predecessor:{id:'replacement-001',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6' as const,backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}};
}

test('G11 compiles mapping-only removal by Field identity while retaining the removed Field declaration',()=>{
 const input=request(),result=compileTableMigration(input);
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));expect(result.status).toBe('compiled');
 expect(result.plan.version).toBe('umf.table-migration/0.6');
 expect(result.plan.phases).toEqual([{id:'phase-00001',kind:'field-replacement',transaction:'required',steps:result.plan.steps.map(step=>step.id)}]);
 expect(result.plan.executionProfile).toEqual({version:'umf.table-migration-execution/0.5',progressRelation:'umf_lifecycle_progress',ownerOnly:true,ingressProfile:'umf.table-generation-ingress/0.1'});
 expect(result.plan.steps.map(step=>step.phaseOperation)).toEqual(['drop-column','add-column']);
 expect(result.plan.steps[0]!.phaseTarget).toEqual({table:'notes',field:ref('summary')});
 expect(result.plan.steps[1]!.phaseTarget).toEqual({table:'notes',field:ref('displaySummary')});
 expect(result.plan.next.source.utf8).toContain('"id":"summary"');
});

test('G11 JSON Schemas admit the compiled plan and reject inconsistent phase carriers',()=>{
 const result=compileTableMigration(request());if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 const validator=createValidator(false);validator.addSchema(tablesSchema);validator.addSchema(deploymentSchema);validator.addSchema(g11PhasesSchema);
 const validatePlan=validator.compile(g11MigrationSchema),validatePhases=validator.compile(g11PhasesSchema);
 expect(validatePlan(result.plan)).toBe(true);expect(validatePhases({executionProfile:result.plan.executionProfile,phases:result.plan.phases})).toBe(true);
 const withoutIngress=structuredClone(result.plan.executionProfile!);delete (withoutIngress as any).ingressProfile;
 expect(validatePhases({executionProfile:withoutIngress,phases:result.plan.phases})).toBe(false);
 for(const mutate of [
  (plan:any)=>delete plan.executionProfile,
  (plan:any)=>plan.executionProfile.version='umf.table-migration-execution/0.4',
  (plan:any)=>delete plan.executionProfile.ingressProfile,
  (plan:any)=>plan.executionProfile.ingressProfile='umf.table-generation-ingress/0.2',
  (plan:any)=>plan.steps[0].phaseOperation='change-default',
  (plan:any)=>plan.steps[0].operation='add-column',
  (plan:any)=>plan.steps[0].phaseDependency={table:'notes',kind:'key',id:'primary',sourcePath:'/x',meaningDigest:'0'.repeat(64)},
  (plan:any)=>delete plan.steps[0].phaseTarget,
 ]){const forged=structuredClone(result.plan);mutate(forged);expect(validatePlan(forged)).toBe(false);}
 const conversion=structuredClone(result.plan);conversion.options!.reviewedChanges![0]!.conversion='pg-cast-v1';expect(validatePlan(conversion)).toBe(false);
 expect(compileTableMigration({...request(),options:{...request().options,reviewedChanges:request().options.reviewedChanges.map(marker=>({...marker,conversion:'pg-cast-v1'}))}}).status).toBe('blocked');
});

test('G11 admits a new Key only from its shifted successor source identity',()=>{
 const {before,after}=sourcePair(undefined,true),oldModule=before.modules[0]!,module=after.modules[0]!,record=module.elements.find((item:any)=>item.id==='Note');
 for(const doc of [before,after])doc.modules[0]!.extensions['umf.tables'].commands=doc.modules[0]!.extensions['umf.tables'].commands.filter((item:any)=>!['rename','put_update'].includes(item.id));
 record.keys.push({id:'owner_lookup',name:'owner_lookup',primary:false,fields:[ref('owner')]});
 const previous=compiledBundle(before),next=compiledBundle(after),candidates=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}),candidate=candidates.find(item=>item.kind==='replace-primary-key'&&item.newValue&&JSON.stringify(item.newValue).includes('owner_lookup'));
 expect(candidate).toBeDefined();if(!candidate)throw new Error('Missing added Key candidate');
 const oldRecordIndex=oldModule.elements.findIndex((item:any)=>item.id==='Note'),newRecordIndex=module.elements.findIndex((item:any)=>item.id==='Note');
 expect(newRecordIndex).toBe(oldRecordIndex-1);expect(candidate.oldPath).toBeNull();expect(candidate.newPath).toBe('/modules/0/elements/'+newRecordIndex+'/keys/1');expect(candidate.path).toBe(candidate.newPath!);
 const reviewedChanges=candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker),request={id:'g11-added-key',predecessor:{id:'g11-added-key-previous',digest:'9'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6' as const,backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}};
 const compiled=compileTableMigration(request);if(compiled.status!=='compiled')throw new Error(JSON.stringify(compiled));expect(compiled.status).toBe('compiled');expect(compileTableMigration({...request,options:{...request.options,reviewedChanges:reviewedChanges.filter(item=>item.id!==candidate.id)}}).status).toBe('blocked');
 const validator=createValidator(false);validator.addSchema(tablesSchema);validator.addSchema(deploymentSchema);validator.addSchema(g11PhasesSchema);const validatePlan=validator.compile(g11MigrationSchema);
 expect(validatePlan(compiled.plan)).toBe(true);
 const forgedDependency=structuredClone(compiled.plan),keyDependency=forgedDependency.steps.find(step=>step.phaseOperation==='dependency-add'&&step.phaseDependency?.kind==='key');
 if(!keyDependency)throw new Error('Expected typed Key dependency effect');keyDependency.kind='index';expect(validatePlan(forgedDependency)).toBe(false);
 const forgedGrant=structuredClone(compiled.plan),grantDependency=forgedGrant.steps.find(step=>step.phaseDependency?.kind==='grant');
 if(!grantDependency)throw new Error('Expected typed grant dependency effect');grantDependency.kind='table';expect(validatePlan(forgedGrant)).toBe(false);
});

test('G11 preserves unaffected authored seeds without replay when a Field mapping changes',()=>{
 const {before,after}=sourcePair();
 const retainedSeed=[{id:'unchanged-authored-seed',conflict:'error',rows:[{table:'notes',values:[{field:ref('id'),value:{string:'seed-1'}},{field:ref('owner'),value:{string:'g11_alice'}}]}]}];
 before.modules[0]!.extensions['umf.tables'].seedSets=structuredClone(retainedSeed);after.modules[0]!.extensions['umf.tables'].seedSets=structuredClone(retainedSeed);
 const previous=compiledBundle(before),next=compiledBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'g11-seed-preservation',predecessor:{id:'g11-seed-preservation-previous',digest:'8'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}});
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));expect(result.status).toBe('compiled');expect(result.plan.seedExecution).toBe('none');expect(result.plan.previous!.seedSets).toEqual(result.plan.next.seedSets);expect(result.plan.steps.every(step=>step.kind!=='seed')).toBe(true);
});

test('G11 supports definition removal at a middle source position and orders multiple fill targets by typed DAG',()=>{
 const removed=request();
 // The successor removes the old declaration as well as its membership/mapping.
 const pair=sourcePair(undefined,true),previous=compiledBundle(pair.before),next=compiledBundle(pair.after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({...removed,previous,next,options:{...removed.options,reviewedChanges}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 expect(result.plan.steps.map(step=>step.phaseOperation)).toEqual(['drop-column','add-column']);
 const multiple=compileTableMigration(multipleFillRequest());expect(multiple.status).toBe('compiled');if(multiple.status!=='compiled')throw new Error(JSON.stringify(multiple));
 const roles=multiple.plan.steps.map(step=>[step.phaseOperation,step.phaseTarget?.field.element]);
 for(const field of ['displaySummary','displayCaption'])expect(roles).toContainEqual(['backfill',field]);
 expect(multiple.plan.steps.map(step=>step.id)).toEqual(multiple.plan.steps.map((_,index)=>'step-'+String(index+1).padStart(5,'0')));
 for(const field of ['displaySummary','displayCaption'])expect(roles.findIndex(role=>role[0]==='add-column'&&role[1]===field)).toBeLessThan(roles.findIndex(role=>role[0]==='backfill'&&role[1]===field));
});

test('G11 binds changed CHECK subjects and orders their removal/addition around the exact Field carriers',()=>{
 const pair=sourcePair(document=>{
  const table=document.modules[0].extensions['umf.tables'].tables[0];
  table.checks=[{id:'summary-check',name:'summary_check',expression:{op:'eq',left:{op:'field',field:ref(document.modules[0].elements.some((item:any)=>item.id==='summary')?'summary':'displaySummary')},right:{op:'literal',value:{string:'x'}}}}];
 });
 pair.before.modules[0].extensions['umf.tables'].tables[0].checks=structuredClone(pair.after.modules[0].extensions['umf.tables'].tables[0].checks);
 pair.after.modules[0].extensions['umf.tables'].tables[0].checks[0].expression.left.field=ref('displaySummary');
 pair.before.modules[0].extensions['umf.tables'].tables[0].checks[0].expression.left.field=ref('summary');
 const previous=compiledBundle(pair.before),next=compiledBundle(pair.after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'replacement-check',predecessor:{id:'replacement-001',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}});
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 const dependencies=result.plan.steps.filter(step=>step.phaseDependency?.kind==='check');
 expect(dependencies.map(step=>step.phaseOperation)).toEqual(['dependency-drop','dependency-add']);
 expect(dependencies.map(step=>step.phaseDependency?.sourcePath)).toEqual(['/modules/0/extensions/umf.tables/tables/0/checks/0','/modules/0/extensions/umf.tables/tables/0/checks/0']);
 const roles=result.plan.steps.map(step=>step.phaseOperation);
 expect(roles.indexOf('dependency-drop')).toBeLessThan(roles.indexOf('drop-column'));
 expect(roles.indexOf('add-column')).toBeLessThan(roles.indexOf('dependency-add'));
 expect(dependencies[0]?.phaseDependency?.meaningDigest).not.toBe(dependencies[1]?.phaseDependency?.meaningDigest);
});

test('G11 binds generated finite-domain CHECK drops and additions to exact Field mappings',()=>{
 const pair=sourcePair(undefined,true),oldModule=pair.before.modules[0]!,newModule=pair.after.modules[0]!;
 const oldField=oldModule.elements.find((item:any)=>item.kind==='field'&&item.id==='summary')!,newField=newModule.elements.find((item:any)=>item.kind==='field'&&item.id==='displaySummary')!;
 oldField.facets={length:{min:1,unit:'unicode-scalar'}};newField.facets={length:{min:2,unit:'unicode-scalar'}};
 const previous=compiledBundle(pair.before),next=compiledBundle(pair.after),candidates=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'});
 const oldDomain=candidates.find(candidate=>candidate.kind==='replace-check'&&(candidate.oldValue as any)?.logical?.field?.id==='summary');
 const newDomain=candidates.find(candidate=>candidate.kind==='replace-check'&&(candidate.newValue as any)?.logical?.field?.id==='displaySummary');
 expect(oldDomain).toBeDefined();expect(newDomain).toBeDefined();
 expect(oldDomain!.oldPath).toBe(previous.expectedCatalog.columns.find(column=>column.field.element==='summary')!.sourcePath+'/domain');
 expect(newDomain!.newPath).toBe(next.expectedCatalog.columns.find(column=>column.field.element==='displaySummary')!.sourcePath+'/domain');
 expect((oldDomain!.oldValue as any).logical.column).toEqual(pair.before.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((column:any)=>column.field.element==='summary'));
 expect((oldDomain!.oldValue as any).logical.field).toEqual(oldField);
 const reviewedChanges=candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker),input={id:'domain-check-replacement',predecessor:{id:'domain-check-previous',digest:'b'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6' as const,backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}};
 const result=compileTableMigration(input);if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 const oldDomainId=(oldDomain!.oldValue as any).physical.id,oldDrop=result.plan.steps.find(step=>step.phaseDependency?.id===oldDomainId);
 expect(oldDrop?.phaseOperation).toBe('dependency-drop');expect(oldDrop?.phaseDependency?.sourcePath).toBe(oldDomain!.oldPath!);
 const newCheck=result.plan.steps.find(step=>step.phaseTarget?.field.element==='displaySummary'&&step.phaseOperation==='target-check');
 expect(newCheck?.sourcePath).toBe(newDomain!.newPath!);expect(newCheck?.sql).toContain('CHECK');
 for(const badMarkers of [reviewedChanges.filter(marker=>marker.id!==oldDomain!.id),reviewedChanges.map(marker=>marker.id===oldDomain!.id?{...marker,oldDigest:'f'.repeat(64)}:marker)]){
  expect(compileTableMigration({...input,options:{...input.options,reviewedChanges:badMarkers}}).status).toBe('blocked');
 }
});

test('G11 permits only source-path relocation of retained inputs after an earlier column is removed',()=>{
 const {before,after}=sourcePair(undefined,true),externalModule={id:'aux',namespace:'aux',elements:[{id:'externalOwner',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}}],extensions:{}},externalRef={module:'aux',element:'externalOwner'};
 for(const document of [before,after]){document.modules.push(structuredClone(externalModule));document.modules[0]!.elements.find((item:any)=>item.id==='Note')!.members.push(externalRef);document.modules[0]!.extensions['umf.tables'].tables[0]!.columns.push({field:externalRef,name:'external_owner',nativeType:{kind:'text'}});}
 const nextRecord=after.modules[0]!.elements.find((item:any)=>item.id==='Note')!,nextMembers=nextRecord.members,displayMember=nextMembers.splice(nextMembers.findIndex((member:any)=>member.element==='displaySummary'),1)[0];nextMembers.push(displayMember);
 const nextColumns=after.modules[0]!.extensions['umf.tables'].tables[0]!.columns,displayColumn=nextColumns.splice(nextColumns.findIndex((column:any)=>column.field.element==='displaySummary'),1)[0];nextColumns.push(displayColumn);
 const table=before.modules[0]!.extensions['umf.tables'].tables[0]!,summaryIndex=table.columns.findIndex((column:any)=>column.field.element==='summary');
 const [summary]=table.columns.splice(summaryIndex,1);table.columns.splice(1,0,summary);
 const command={version:'umf.table-operation/0.2',id:'fill_display_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref('displaySummary')},values:[{field:ref('displaySummary'),value:{kind:'rowExpression',expression:{op:'concat',args:[{op:'field',field:externalRef},{op:'literal',value:{string:'!'}}]}}}],returning:[],maxRows:100}};
 after.modules[0]!.extensions['umf.tables'].commands.push(command);
 after.modules[0]!.elements.find((item:any)=>item.id==='displaySummary')!.nullability='required';
 for(const operation of after.modules[0]!.extensions['umf.tables'].commands){if(!['insert','upsert'].includes(operation.body?.kind))continue;operation.parameters.push({id:'displaySummary',field:ref('displaySummary')});operation.body.values.push({field:ref('displaySummary'),value:{kind:'parameter',parameter:'displaySummary'}});}
 const previous=compiledBundle(before),next=compiledBundle(after),oldInput=previous.expectedCatalog.columns.find(column=>column.field.element==='externalOwner')!,newInput=next.expectedCatalog.columns.find(column=>column.field.element==='externalOwner')!;
 expect(oldInput.sourcePath).not.toBe(newInput.sourcePath);
 const reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'middle-column-input',predecessor:{id:'middle-column-input-previous',digest:'c'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[{table:'notes',column:ref('displaySummary'),operation:'fill_display_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges,validations:[]}});
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));expect(result.status).toBe('compiled');
 const changedInput=structuredClone(after);changedInput.modules[1]!.elements.find((item:any)=>item.id==='externalOwner')!.description='changed input meaning';
 const changedNext=compiledBundle(changedInput);
 expect(compileTableMigration({id:'middle-column-input-negative',predecessor:{id:'middle-column-input-previous',digest:'c'.repeat(64)},previous,next:changedNext,options:{version:'umf.table-migration-options/0.6',backfills:[{table:'notes',column:ref('displaySummary'),operation:'fill_display_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:discoverTableMigrationChanges(previous,changedNext,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker),validations:[]}}).status).toBe('blocked');
});

test('G11 rejects removal of an unselected unused Field and reordering retained operations',()=>{
 const pair=sourcePair(undefined,true);pair.before.modules[0]!.elements.push({id:'unusedField',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 const previous=compiledBundle(pair.before),next=compiledBundle(pair.after),markers=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const input={id:'unused-definition',predecessor:{id:'unused-previous',digest:'d'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6' as const,backfills:[],concurrentIndexes:[],reviewedChanges:markers,validations:[]}};
 expect(compileTableMigration(input).status).toBe('blocked');

 const reordered=sourcePair(undefined,true),commands=reordered.before.modules[0]!.extensions['umf.tables'].commands;
 reordered.before.modules[0]!.extensions['umf.tables'].commands=[...commands].reverse();
 const oldBundle=compiledBundle(reordered.before),newBundle=compiledBundle(reordered.after),reorderedMarkers=discoverTableMigrationChanges(oldBundle,newBundle,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 expect(compileTableMigration({id:'command-order',predecessor:{id:'command-order-previous',digest:'e'.repeat(64)},previous:oldBundle,next:newBundle,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges:reorderedMarkers,validations:[]}}).status).toBe('blocked');
});

test('G11 projects a seed-free Legal domain replacement while preserving owner/via RLS and batch UPDATE denial',()=>{
 const before=legalSource(),after=structuredClone(before),module=before.modules[0]!,nextModule=after.modules[0]!,nextTables=nextModule.extensions['umf.tables'].tables;
 // This fixture is an explicit seed-free deployment projection: G11 does not
 // mutate or replay the Legal pack's bootstrap rows during this migration.
 module.extensions['umf.tables'].seedSets=[];nextModule.extensions['umf.tables'].seedSets=[];
 const legalRef=(element:string)=>({module:'legal_lifecycle',element});
 const previousCourt=legalRef('matters__court'),nextCourt=legalRef('matters__reviewCourt');
 nextModule.elements.find((item:any)=>item.id==='matters')!.members=nextModule.elements.find((item:any)=>item.id==='matters')!.members.filter((item:any)=>item.element!=='matters__court');
 nextModule.elements=nextModule.elements.filter((item:any)=>item.id!=='matters__court');
 nextModule.elements.push({id:'matters__reviewCourt',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 nextModule.elements.find((item:any)=>item.id==='matters')!.members.push(nextCourt);
 nextTables.find((item:any)=>item.id==='matters')!.columns=nextTables.find((item:any)=>item.id==='matters')!.columns.filter((item:any)=>item.field.element!=='matters__court');
 nextTables.find((item:any)=>item.id==='matters')!.columns.push({field:nextCourt,name:'court',nativeType:{kind:'text'}});
 after.modules[0]!.extensions['umf.tables'].commands.find((item:any)=>item.id==='read_matters').body.fields=after.modules[0]!.extensions['umf.tables'].commands.find((item:any)=>item.id==='read_matters').body.fields.filter((field:any)=>field.element!=='matters__court');
 after.modules[0]!.extensions['umf.tables'].commands.find((item:any)=>item.id==='read_matters').body.fields.push(nextCourt);
 after.modules[0]!.extensions['umf.tables'].commands.push({version:'umf.table-operation/0.2',id:'fill_review_court',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'matters',where:{op:'isNull',field:nextCourt},values:[{field:nextCourt,value:{kind:'rowExpression',expression:{op:'field',field:legalRef('matters__practice_area')}}}],returning:[],maxRows:100}});
 const previous=compiledLegalBundle(before),next=compiledLegalBundle(after),candidates=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}),reviewedChanges=candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'g11-legal-domain',predecessor:{id:'g11-legal-domain-previous',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[{table:'matters',column:nextCourt,operation:'fill_review_court',scopedRows:true}],concurrentIndexes:[],reviewedChanges,validations:[]}});
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));expect(result.status).toBe('compiled');
 expect(previous.seedSets).toEqual([]);expect(next.seedSets).toEqual([]);
 expect(previous.expectedCatalog.tables.find((item:any)=>item.id==='matters')!.policy.person).toEqual(next.expectedCatalog.tables.find((item:any)=>item.id==='matters')!.policy.person);
 expect(previous.expectedCatalog.tables.find((item:any)=>item.id==='matters')!.policy.batch.update).toEqual({kind:'deny'});
 expect(next.expectedCatalog.tables.find((item:any)=>item.id==='matters')!.policy.batch.update).toEqual({kind:'deny'});
 expect(JSON.parse(previous.source.utf8).modules[0].extensions['umf.tables'].tables.find((item:any)=>item.id==='matters').policy.person.select.rules[0].kind).toBe('related');
 expect(result.plan.steps.some(step=>step.phaseOperation==='backfill'&&step.operation==='fill_review_court')).toBe(true);
 expect(result.plan.steps.some(step=>step.phaseOperation==='dependency-drop'||step.phaseOperation==='dependency-add')).toBe(false);
 expect(previous.expectedCatalog.columns.find((item:any)=>item.table==='matters'&&item.field.element===previousCourt.element)?.name).toBe('court');
 expect(next.expectedCatalog.columns.find((item:any)=>item.table==='matters'&&item.field.element===nextCourt.element)?.name).toBe('court');
});

test('G11 represents allow-to-deny policy evolution as typed drop/add subjects without treating deny as a grant',()=>{
 const {before,after}=sourcePair(document=>{document.modules[0].extensions['umf.tables'].tables[0].policy.batch.update={kind:'allow'};});
 before.modules[0].extensions['umf.tables'].tables[0].policy.batch.update={kind:'allow'};
 after.modules[0].extensions['umf.tables'].tables[0].policy.batch.update={kind:'deny'};
 const previous=compiledBundle(before),next=compiledBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'g11-policy-allow-deny',predecessor:{id:'g11-policy-previous',digest:'b'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 const policy=result.plan.steps.filter(step=>step.phaseDependency?.kind==='policy'&&step.phaseDependency.sourcePath.endsWith('/policy/batch/update'));
 expect(policy.map(step=>step.phaseOperation)).toEqual(['dependency-drop','dependency-add']);
 expect(policy[0]?.phaseDependency?.meaningDigest).not.toBe(policy[1]?.phaseDependency?.meaningDigest);
 expect(result.plan.steps.some(step=>step.phaseDependency?.kind==='grant'&&step.phaseDependency.sourcePath.endsWith('/policy/batch/update')&&step.phaseOperation==='dependency-add')).toBe(false);
 expect(policy[1]?.sql).toContain('USING (FALSE) WITH CHECK (FALSE)');
});

test('G11 represents deny-to-allow policy evolution and restores the typed update grant',()=>{
 const {before,after}=sourcePair(document=>{document.modules[0].extensions['umf.tables'].tables[0].policy.batch.update={kind:'allow'};});
 before.modules[0].extensions['umf.tables'].tables[0].policy.batch.update={kind:'deny'};
 after.modules[0].extensions['umf.tables'].tables[0].policy.batch.update={kind:'allow'};
 const previous=compiledBundle(before),next=compiledBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'g11-policy-deny-allow',predecessor:{id:'g11-policy-deny-allow-previous',digest:'d'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 const policy=result.plan.steps.filter(step=>step.phaseDependency?.kind==='policy'&&step.phaseDependency.sourcePath.endsWith('/policy/batch/update'));
 expect(policy.map(step=>step.phaseOperation)).toEqual(['dependency-drop','dependency-add']);
 expect(result.plan.steps.some(step=>step.phaseDependency?.kind==='grant'&&step.phaseDependency.sourcePath.endsWith('/policy/batch/update')&&step.phaseOperation==='dependency-add')).toBe(true);
 expect(policy[1]?.sql).not.toContain('FALSE');
});

test('internal G11 grant effects retain complete typed table-grant rows for add and revoke',()=>{
 const addedInput=request(true,document=>{document.modules[0].extensions['umf.tables'].tables[0].policy.batch.update={kind:'allow'};});
 const added=compileTableMigrationWithOperations(addedInput);
 if(added.result.status!=='compiled')throw new Error(JSON.stringify(added.result));
 expect(added.operations).toHaveLength(added.result.plan.steps.length);
 const add=added.operations.find(operation=>operation.role==='grant-add');
 expect(add?.subject.type).toBe('grant-group');
 if(add?.subject.type!=='grant-group')throw new Error('G11 grant add lost its complete typed grant rows');
 expect(add.subject).toMatchObject({table:'notes',sourcePath:add.sourcePath,rendererStepId:expect.any(String),rows:[{table:'notes',schema:'plugin_demo',relation:'notes',role:'plugin_batch',privilege:'update',columns:['owner','summary'],grantOption:false}]});
 expect(add.subject.dependencyMeaningDigest).toMatch(/^[a-f0-9]{64}$/);

 const {before,after}=sourcePair(),beforeTable=before.modules[0]!.extensions['umf.tables'].tables[0]!,afterTable=after.modules[0]!.extensions['umf.tables'].tables[0]!;
 beforeTable.policy.batch.update={kind:'allow'};afterTable.policy.batch.update={kind:'deny'};
 const previous=compiledBundle(before),next=compiledBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const revoked=compileTableMigrationWithOperations({id:'typed-grant-revoke',predecessor:{id:'typed-grant-revoke-previous',digest:'f'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}});
 if(revoked.result.status!=='compiled')throw new Error(JSON.stringify(revoked.result));
 expect(revoked.operations).toHaveLength(revoked.result.plan.steps.length);
 const revoke=revoked.operations.find(operation=>operation.role==='grant-revoke');
 if(revoke?.subject.type!=='grant-group')throw new Error('G11 grant revoke lost its complete typed grant rows');
 expect(revoke.subject.rows).toEqual([{table:'notes',schema:'plugin_demo',relation:'notes',role:'plugin_batch',privilege:'update',columns:['owner','summary'],grantOption:false}]);
 expect(revoke.subject.dependencyMeaningDigest).toMatch(/^[a-f0-9]{64}$/);
});

test('G11 orders a referenced Key and its cross-table ForeignKey by typed dependency identity',()=>{
 const before=legalSource(),after=structuredClone(before),module=after.modules[0]!,payload=module.extensions['umf.tables'];
 for(const doc of [before,after])doc.modules[0]!.extensions['umf.tables'].seedSets=[];
 // Exercise the actual replacement profile as well as the cross-table
 // dependency delta: the old field is removed and a new optional Field takes
 // its SQL name, without changing retained command bodies beyond that Field.
 const replacementRef={module:'legal_lifecycle',element:'matters__reviewCourt'},record=module.elements.find((item:any)=>item.id==='matters');
 record.members=record.members.filter((item:any)=>item.element!=='matters__court');
 module.elements=module.elements.filter((item:any)=>item.id!=='matters__court');
 module.elements.push({id:'matters__reviewCourt',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});record.members.push(replacementRef);
 const mattersTable=payload.tables.find((item:any)=>item.id==='matters');
 mattersTable.columns=mattersTable.columns.filter((item:any)=>item.field.element!=='matters__court');mattersTable.columns.push({field:replacementRef,name:'court',nativeType:{kind:'text'}});
 // Preserve the page command's primary-Key order. A second, explicitly named
 // Key is the FK target; its composite expansion exercises dependency order
 // without altering cursor semantics.
 const matters=module.elements.find((item:any)=>item.id==='matters');
 const oldMatterId={module:'legal_lifecycle',element:'matters__matter_id'},clientId={module:'legal_lifecycle',element:'matters__client_id'},timekeeperId={module:'legal_lifecycle',element:'matter_teams__timekeeper_id'};
 for(const doc of [before,after]){
  const docModule=doc.modules[0]!,docPayload=docModule.extensions['umf.tables'],record=docModule.elements.find((item:any)=>item.id==='matters');
  record.keys.push({id:'alternate',name:'matters_alternate',primary:false,fields:[oldMatterId,clientId]});
  const targetForeignKey=docPayload.tables.find((item:any)=>item.id==='matter_teams').foreignKeys.find((item:any)=>item.id==='fk_0');targetForeignKey.target.key='alternate';targetForeignKey.fields.push(timekeeperId);
 }
 matters.keys.find((item:any)=>item.id==='alternate').fields.reverse();matters.keys.reverse();
 const readMatters=payload.commands.find((item:any)=>item.id==='read_matters');readMatters.body.fields=readMatters.body.fields.filter((item:any)=>item.element!=='matters__court');readMatters.body.fields.push(replacementRef);
 const teams=payload.tables.find((item:any)=>item.id==='matter_teams');
 const fk=teams.foreignKeys.find((item:any)=>item.id==='fk_0');
 fk.fields.reverse();
 const previous=compiledLegalBundle(before),next=compiledLegalBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const request={id:'g11-cross-key-fk',predecessor:{id:'g11-cross-key-fk-previous',digest:'c'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6' as const,backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}};
 for(const omittedKind of ['replace-primary-key','replace-foreign-key']){const omitted=reviewedChanges.filter((item:any)=>item.kind!==omittedKind);expect(compileTableMigration({...request,options:{...request.options,reviewedChanges:omitted}}).status).toBe('blocked');}
 const keyMarker=reviewedChanges.find((item:any)=>item.kind==='replace-primary-key'),foreignKeyMarker=reviewedChanges.find((item:any)=>item.kind==='replace-foreign-key');
 if(!keyMarker||!foreignKeyMarker)throw new Error('Expected distinct Key and ForeignKey source markers');
 const transplanted=reviewedChanges.filter((item:any)=>item.id!==keyMarker.id&&item.id!==foreignKeyMarker.id);
 transplanted.push({...keyMarker,kind:foreignKeyMarker.kind,path:foreignKeyMarker.path,oldDigest:foreignKeyMarker.oldDigest,newDigest:foreignKeyMarker.newDigest});
 expect(compileTableMigration({...request,options:{...request.options,reviewedChanges:transplanted}}).status).toBe('blocked');
 const result=compileTableMigration(request);
 if(result.status!=='compiled')throw new Error(JSON.stringify(result));expect(result.status).toBe('compiled');
 const drops=result.plan.steps.filter(step=>step.phaseOperation==='dependency-drop'),adds=result.plan.steps.filter(step=>step.phaseOperation==='dependency-add'),fkDrop=drops.findIndex(step=>step.phaseDependency?.kind==='foreignKey'&&step.phaseDependency.table==='matter_teams'),keyDrop=drops.findIndex(step=>step.phaseDependency?.kind==='key'&&step.phaseDependency.table==='matters'&&step.phaseDependency.id==='alternate'),keyAdd=adds.findIndex(step=>step.phaseDependency?.kind==='key'&&step.phaseDependency.table==='matters'&&step.phaseDependency.id==='alternate'),fkAdd=adds.findIndex(step=>step.phaseDependency?.kind==='foreignKey'&&step.phaseDependency.table==='matter_teams');
 expect(fkDrop).toBeGreaterThanOrEqual(0);expect(keyDrop).toBeGreaterThanOrEqual(0);expect(keyAdd).toBeGreaterThanOrEqual(0);expect(fkAdd).toBeGreaterThanOrEqual(0);
 expect(drops[fkDrop]!.phaseOperation).toBe('dependency-drop');expect(drops[fkDrop]!.phaseDependency!.id).toBe('fk_0');expect(drops[keyDrop]!.phaseDependency!.id).toBe('alternate');
 expect(result.plan.steps.indexOf(drops[fkDrop]!)).toBeLessThan(result.plan.steps.indexOf(drops[keyDrop]!));
 expect(result.plan.steps.indexOf(adds[keyAdd]!)).toBeLessThan(result.plan.steps.indexOf(adds[fkAdd]!));
 expect(drops[fkDrop]!.phaseDependency!.sourcePath).toBe('/modules/0/extensions/umf.tables/tables/3/foreignKeys/0');
});

test('G11 binds via-policy relationship, ForeignKey, target-Key and terminal Field dependencies',()=>{
 const before=legalSource(),after=structuredClone(before),module=after.modules[0]!,payload=module.extensions['umf.tables'],oldRole={module:'legal_lifecycle',element:'matter_teams__database_role'},newRole={module:'legal_lifecycle',element:'matter_teams__database_role_v2'},relationshipId='teams_to_matters';
 for(const doc of [before,after]){
  const docModule=doc.modules[0]!,docPayload=docModule.extensions['umf.tables'];docPayload.seedSets=[];
  (docModule as any).relationships=[{id:relationshipId,name:relationshipId,source:[{module:'legal_lifecycle',element:'matter_teams'}],target:[{module:'legal_lifecycle',element:'matters',key:'primary'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}];
  docPayload.tables.find((item:any)=>item.id==='matter_teams').foreignKeys.find((item:any)=>item.id==='fk_0').relationship={module:'legal_lifecycle',id:relationshipId};
  docPayload.tables.find((item:any)=>item.id==='matters').policy.person.select={kind:'via',path:[{module:'legal_lifecycle',id:relationshipId,direction:'inverse'}],rule:{kind:'owner',field:oldRole}};
 }
 const teamRecord=module.elements.find((item:any)=>item.id==='matter_teams');teamRecord.members=teamRecord.members.filter((item:any)=>item.element!==oldRole.element);teamRecord.members.push(newRole);
 module.elements=module.elements.filter((item:any)=>item.id!==oldRole.element);module.elements.push({id:newRole.element,kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 const teamTable=payload.tables.find((item:any)=>item.id==='matter_teams');teamTable.columns=teamTable.columns.filter((item:any)=>item.field.element!==oldRole.element);teamTable.columns.push({field:newRole,name:'database_role',nativeType:{kind:'text'}});
 const replaceRole=(value:any):any=>{if(Array.isArray(value))return value.map(replaceRole);if(!value||typeof value!=='object')return value;if(value.module===oldRole.module&&value.element===oldRole.element)return newRole;return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,replaceRole(child)]));};
 for(const table of payload.tables)table.policy=replaceRole(table.policy);
 const readTeams=payload.commands.find((item:any)=>item.id==='read_matter_teams');readTeams.body.fields=readTeams.body.fields.filter((item:any)=>item.element!==oldRole.element);readTeams.body.fields.push(newRole);
 const previous=compiledLegalBundle(before),next=compiledLegalBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'g11-via-dependency',predecessor:{id:'g11-via-previous',digest:'e'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 const selected=(operation:string)=>result.plan.steps.findIndex(step=>step.phaseOperation===operation&&step.phaseTarget?.table==='matter_teams'&&step.phaseTarget.field.element===oldRole.element||step.phaseOperation===operation&&step.phaseTarget?.table==='matter_teams'&&step.phaseTarget.field.element===newRole.element);
 const policyDrop=result.plan.steps.findIndex(step=>step.phaseOperation==='dependency-drop'&&step.phaseDependency?.kind==='policy'&&step.phaseDependency.sourcePath.endsWith('/policy/person/select'));
 const policyAdd=result.plan.steps.findIndex(step=>step.phaseOperation==='dependency-add'&&step.phaseDependency?.kind==='policy'&&step.phaseDependency.sourcePath.endsWith('/policy/person/select'));
 expect(policyDrop).toBeGreaterThanOrEqual(0);expect(policyAdd).toBeGreaterThanOrEqual(0);
 const dropColumn=result.plan.steps.findIndex(step=>step.phaseOperation==='drop-column'&&step.phaseTarget?.field.element===oldRole.element),addColumn=result.plan.steps.findIndex(step=>step.phaseOperation==='add-column'&&step.phaseTarget?.field.element===newRole.element);
 expect(dropColumn).toBeGreaterThan(policyDrop);expect(addColumn).toBeLessThan(policyAdd);expect(selected('drop-column')).toBe(dropColumn);expect(selected('add-column')).toBe(addColumn);
 const subject= result.plan.steps[policyDrop]!.phaseDependency!;expect(subject.kind).toBe('policy');expect(subject.meaningDigest).not.toBe(result.plan.steps[policyAdd]!.phaseDependency!.meaningDigest);
});

test('G11 refuses missing purge review, unrelated logical edits and source-context forgery',()=>{
 const missing=request(false);expect(compileTableMigration(missing).status).toBe('blocked');
 const unrelated=request();const doc=JSON.parse(unrelated.next.source.utf8);doc.title='unreviewed';
 const changed=compiledBundle(doc);expect(compileTableMigration({...unrelated,next:changed}).status).toBe('blocked');
 const wrongContext=request();const contextMarker=wrongContext.options.reviewedChanges.find((marker:any)=>marker.kind==='change-operation-context');
 expect(contextMarker).toBeDefined();if(contextMarker){contextMarker.oldDigest='0'.repeat(64);expect(compileTableMigration(wrongContext).status).toBe('blocked');}
 const predicate=request(),predicatePreviousDoc=JSON.parse(predicate.previous.source.utf8),predicateDoc=JSON.parse(predicate.next.source.utf8),oldRead=predicatePreviousDoc.modules[0].extensions['umf.tables'].commands.find((item:any)=>item.body?.kind==='read'),predicateCommand=predicateDoc.modules[0].extensions['umf.tables'].commands.find((item:any)=>item.body?.kind==='read');
 oldRead.parameters[0].id='selected';oldRead.parameters[0].field=ref('summary');oldRead.body.where={op:'eq',field:ref('summary'),value:{kind:'parameter',parameter:'selected'}};
 predicateCommand.parameters[0].id='selected';predicateCommand.parameters[0].field=ref('displaySummary');predicateCommand.body.where={op:'eq',field:ref('displaySummary'),value:{kind:'parameter',parameter:'selected'}};
 const predicatePrevious=compiledBundle(predicatePreviousDoc),predicateNext=compiledBundle(predicateDoc),predicateCandidates=discoverTableMigrationChanges(predicatePrevious,predicateNext,{version:'umf.table-migration-discovery/0.3'}),predicateMarkers=predicateCandidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 expect(compileTableMigration({...predicate,previous:predicatePrevious,next:predicateNext,options:{...predicate.options,reviewedChanges:predicateMarkers}}).status).toBe('blocked');
 const extraRoot=request(),rootDoc=JSON.parse(extraRoot.next.source.utf8),rootCommand=rootDoc.modules[0].extensions['umf.tables'].commands.find((item:any)=>item.body?.kind==='read');rootCommand.vendorSemantics={mode:'preserve'};
 const rootNext={...extraRoot.next,source:{...extraRoot.next.source,utf8:JSON.stringify(rootDoc)}};rootNext.sourceDigest=sha256Text(rootNext.source.utf8);
 const rootCandidates=discoverTableMigrationChanges(extraRoot.previous,rootNext,{version:'umf.table-migration-discovery/0.3'}),rootMarkers=rootCandidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 expect(()=>validateG11SourceCorrespondence(extraRoot.previous,rootNext,rootMarkers)).toThrow();
});

test('G11 refuses to revise retained authored seed-set behavior',()=>{
 const before=legalSource(),after=structuredClone(before);after.modules[0]!.extensions['umf.tables'].seedSets[0]!.conflict='ignore';
 const previous=compiledLegalBundle(before),next=compiledLegalBundle(after),reviewedChanges=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'}).map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const result=compileTableMigration({id:'g11-seed-preservation',predecessor:{id:'g11-seed-previous',digest:'f'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.6',backfills:[],concurrentIndexes:[],reviewedChanges,validations:[]}});
 expect(result.status).toBe('blocked');expect(JSON.stringify(result)).toContain('seedSets array to remain unchanged');
});

test('discovery 0.3 hashes exact source bytes and preserves both pointers for operation identities containing null',()=>{
 const {before,after}=sourcePair(),previous=compiledBundle(before),next=compiledBundle(after);
 previous.sourceDigest='f'.repeat(64);
 const candidates=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'});
 const context=candidates.find(candidate=>candidate.kind==='change-operation-context'&&candidate.path.endsWith('/commands/0'))!;
 expect(context.oldValue).toMatchObject({source:{format:'json',sha256:sha256Text(previous.source.utf8)}});
 expect(context.newValue).toMatchObject({source:{format:'json',sha256:sha256Text(next.source.utf8)}});
 expect(context.oldPath).toBe('/modules/0/extensions/umf.tables/commands/0');
 expect(context.newPath).toBe('/modules/0/extensions/umf.tables/commands/0');
 const changed=sourcePair(document=>{document.modules[0].extensions['umf.tables'].commands[0].body.maxRows=2;}),oldBundle=compiledBundle(changed.before),newBundle=compiledBundle(changed.after);
 const operation=discoverTableMigrationChanges(oldBundle,newBundle,{version:'umf.table-migration-discovery/0.3'}).find(candidate=>candidate.kind==='change-operation'&&candidate.path.endsWith('/commands/0'))!;
 expect(operation.oldPath).toBe('/modules/0/extensions/umf.tables/commands/0');
 expect(operation.newPath).toBe('/modules/0/extensions/umf.tables/commands/0');
});
