// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Inert legal-domain source fixtures for mixed G10 create + retained G02 field
 * qualification. These builders do not compile, select, or execute a plan.
 */
import {legalSource,moduleId} from './legal-fixture';

type Json=any;
const ref=(element:string)=>({module:moduleId,element});
const allow={kind:'allow'},deny={kind:'deny'};
const rules=(rule:Json)=>Object.fromEntries(['select','insert','update','delete'].map(command=>[command,structuredClone(rule)]));
const payload=(source:Json)=>source.modules[0]!.extensions['umf.tables'];
const record=(source:Json,id:string)=>source.modules[0]!.elements.find((element:Json)=>element.kind==='record'&&element.id===id);
const table=(source:Json,id:string)=>payload(source).tables.find((entry:Json)=>entry.id===id);

function reviewGroupSource():Json{
 const groupField=ref('matter_review_groups__review_group_id'),nameField=ref('matter_review_groups__group_name');
 const teamId=ref('matter_review_teams__review_team_id'),teamGroup=ref('matter_review_teams__review_group_id'),teamName=ref('matter_review_teams__team_name');
 const fields=[
  {id:groupField.element,name:groupField.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},
  {id:nameField.element,name:nameField.element,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},
  {id:teamId.element,name:teamId.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},
  {id:teamGroup.element,name:teamGroup.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},
  {id:teamName.element,name:teamName.element,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},
 ];
 const records=[
  {id:'matter_review_groups',name:'matter_review_groups',kind:'record',members:[groupField,nameField],keys:[{id:'primary',name:'primary',primary:true,fields:[groupField]}],extensions:{}},
  {id:'matter_review_teams',name:'matter_review_teams',kind:'record',members:[teamId,teamGroup,teamName],keys:[{id:'primary',name:'primary',primary:true,fields:[teamId]}],extensions:{}},
 ];
 const p={id:'matter_review_groups',record:ref('matter_review_groups'),name:'matter_review_groups',columns:[{field:groupField,name:'review_group_id',nativeType:{kind:'int4'}},{field:nameField,name:'group_name',nativeType:{kind:'text'}}],indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person:rules(deny),batch:{...rules(deny),select:allow}}};
 const t={id:'matter_review_teams',record:ref('matter_review_teams'),name:'matter_review_teams',columns:[{field:teamId,name:'review_team_id',nativeType:{kind:'int4'}},{field:teamGroup,name:'review_group_id',nativeType:{kind:'int4'}},{field:teamName,name:'team_name',nativeType:{kind:'text'}}],indexes:[],checks:[],foreignKeys:[{id:'group_fk',name:'matter_review_teams_group_fk',fields:[teamGroup],target:{record:ref('matter_review_groups'),key:'primary'},onUpdate:'noAction',onDelete:'restrict',deferrable:false}],policy:{mode:'native-rls',person:rules(deny),batch:{...rules(deny),select:allow}}};
 return {fields,records,tables:[p,t]};
}

function insertBeforeRetainedMatters(source:Json, additions:ReturnType<typeof reviewGroupSource>):void{
 const elements=source.modules[0]!.elements as Json[];
 const mattersFirst=elements.findIndex(item=>item.kind==='field'&&item.id.startsWith('matters__'));
 if(mattersFirst<0)throw new Error('legal fixture lost the retained matters field block');
 elements.splice(mattersFirst,0,...additions.fields,...additions.records);
 const tables=payload(source).tables as Json[],mattersIndex=tables.findIndex(item=>item.id==='matters');
 if(mattersIndex<0)throw new Error('legal fixture lost the retained matters table');
 tables.splice(mattersIndex,0,...additions.tables);
}

function appendReviewDate(source:Json):void{
 const field=ref('matters__review_date'),matterRecord=record(source,'matters'),matterTable=table(source,'matters');
 if(!matterRecord||!matterTable)throw new Error('legal fixture lost matters identity');
 source.modules[0]!.elements.push({id:field.element,name:field.element,kind:'field',scalarType:'date',cardinality:'one',nullability:'required',extensions:{}});
 matterRecord.members.push(field);
 matterTable.columns.push({field,name:'review_date',nativeType:{kind:'date'}});
 payload(source).commands.push({version:'umf.table-operation/0.2',id:'derive_matter_review_date',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'matters',where:{op:'isNull',field},values:[{field,value:{kind:'rowExpression',expression:{op:'field',field:ref('matters__open_date')}}}],returning:[],maxRows:2}});
}

function addUnselectedQueueCandidate(source:Json):void{
 const id=ref('matter_review_queue__queue_id'),team=ref('matter_review_queue__review_team_id'),label=ref('matter_review_queue__queue_label');
 source.modules[0]!.elements.push(
  {id:id.element,name:id.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},
  {id:team.element,name:team.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},
  {id:label.element,name:label.element,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},
  {id:'matter_review_queue',name:'matter_review_queue',kind:'record',members:[id,team,label],keys:[{id:'primary',name:'primary',primary:true,fields:[id]}],extensions:{}},
 );
 payload(source).tables.push({id:'matter_review_queue',record:ref('matter_review_queue'),name:'matter_review_queue',columns:[{field:id,name:'queue_id',nativeType:{kind:'int4'}},{field:team,name:'review_team_id',nativeType:{kind:'int4'}},{field:label,name:'queue_label',nativeType:{kind:'text'}}],indexes:[],checks:[],foreignKeys:[{id:'team_fk',name:'matter_review_queue_team_fk',fields:[team],target:{record:ref('matter_review_teams'),key:'primary'},onUpdate:'noAction',onDelete:'restrict',deferrable:false}],policy:{mode:'native-rls',person:rules(deny),batch:{...rules(deny),select:allow}}});
 payload(source).commands.push({version:'umf.table-operation/0.1',id:'create_unselected_review_queue',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'insert',table:'matter_review_queue',values:[{field:id,value:{kind:'literal',value:{integerToken:'701'}}},{field:team,value:{kind:'literal',value:{integerToken:'401'}}},{field:label,value:{kind:'literal',value:{string:'unselected synthetic follow-up'}}}],returning:[],maxRows:1}});
 payload(source).seedSets.push({id:'unselected-review-queue-seed',conflict:'error',rows:[{table:'matter_review_queue',values:[{field:id,value:{integerToken:'702'}},{field:team,value:{integerToken:'401'}},{field:label,value:{string:'unselected synthetic queue row'}}]}]});
}

export const mixedCreatedTableSeedCommand={version:'umf.table-operation/0.1',id:'create_review_team',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'insert',table:'matter_review_teams',values:[{field:ref('matter_review_teams__review_team_id'),value:{kind:'literal',value:{integerToken:'401'}}},{field:ref('matter_review_teams__review_group_id'),value:{kind:'literal',value:{integerToken:'41'}}},{field:ref('matter_review_teams__team_name'),value:{kind:'literal',value:{string:'Fabricated appellate review'}}}],returning:[],maxRows:1}};
export const mixedCreatedTableSeedSet={id:'selected-review-team-seed',conflict:'error',rows:[{table:'matter_review_teams',values:[{field:ref('matter_review_teams__review_team_id'),value:{integerToken:'401'}},{field:ref('matter_review_teams__review_group_id'),value:{integerToken:'41'}},{field:ref('matter_review_teams__team_name'),value:{string:'Fabricated appellate review'}}]}]};
export const selectedReviewGroupSeedSet={id:'selected-review-group-seed',conflict:'error',rows:[{table:'matter_review_groups',values:[{field:ref('matter_review_groups__review_group_id'),value:{integerToken:'41'}},{field:ref('matter_review_groups__group_name'),value:{string:'Fabricated appellate group'}}]}]};
export const unselectedReviewTeamSeedSet={id:'unselected-review-team-seed',conflict:'error',rows:[{table:'matter_review_teams',values:[{field:ref('matter_review_teams__review_team_id'),value:{integerToken:'402'}},{field:ref('matter_review_teams__review_group_id'),value:{integerToken:'41'}},{field:ref('matter_review_teams__team_name'),value:{string:'Unselected synthetic team'}}]}]};

export function legalG10MixedSources(){
 const previous=legalSource(),next=structuredClone(previous),additions=reviewGroupSource();
 insertBeforeRetainedMatters(next,additions);
 // Keep the original four-table synthetic bootstrap prefix, then append candidate seeds.
 payload(next).seedSets.push(structuredClone(selectedReviewGroupSeedSet),structuredClone(mixedCreatedTableSeedSet),structuredClone(unselectedReviewTeamSeedSet));
 payload(next).commands.push(structuredClone(mixedCreatedTableSeedCommand));
 appendReviewDate(next);
 const unselectedNext=structuredClone(next);
 addUnselectedQueueCandidate(unselectedNext);
 const g02Options={version:'umf.table-migration-options/0.4' as const,backfills:[{table:'matters',column:ref('matters__review_date'),operation:'derive_matter_review_date',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[],validations:[]};
 const selectedG10SourceSelection={profile:'umf.table-inventory-migration-options/0.1',tableIntents:[{kind:'create',table:'matter_review_groups',record:ref('matter_review_groups')},{kind:'create',table:'matter_review_teams',record:ref('matter_review_teams')}],seedSets:[selectedReviewGroupSeedSet.id,mixedCreatedTableSeedSet.id],retiredSeedSets:[]};
 const unselectedCreateOnlyCase={profile:'umf.table-inventory-migration-options/0.1',tableIntents:[],seedSets:[],retiredSeedSets:[],sourceCommandId:'create_unselected_review_queue',sourceSeedSetId:'unselected-review-queue-seed',expectedSelection:'refuse: added queue table lacks a selected create intent'};
 const sourceClosureCases={selectedCreateCommand:{id:mixedCreatedTableSeedCommand.id,targetTable:'matter_review_teams',selectionBasis:'selected create table source closure; no independent command selector asserted'},unselectedCreateCommand:{id:unselectedCreateOnlyCase.sourceCommandId,targetTable:'matter_review_queue',selectionBasis:'no selected create intent; expected refusal'}};
 return {previous,next,unselectedNext,g02Options,selectedG10SourceSelection,unselectedCreateOnlyCase,sourceClosureCases,unselectedSeedDisposition:{id:unselectedReviewTeamSeedSet.id,selected:false,expectedDisposition:'not-run'},provenance:{classification:'fabricated synthetic legal-domain operational data',sourceFiles:['spec/domain-packs/legal/umf/matters.json','spec/domain-packs/legal/umf/matter_teams.json','spec/domain-packs/legal/umf/timekeepers.json','spec/domain-packs/legal/umf/clients.json'],sourceRelationship:'new fabricated review-group/team schemas follow the relational-FK pattern in the legal source pack; these are not copied original source schemas and link no observed case/evidence records',personViaPolicyPreserved:true,batchUpdateDenied:true}};
}
