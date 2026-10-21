// SPDX-License-Identifier: MIT OR Apache-2.0
/** Deterministic inputs for native v0.2 reviewed-evolution acceptance. */
import {legalSource,ownerViaLegalSource,evolvedLegalSource} from './legal-fixture';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges} from '../../src/table-migration';

const moduleId='legal_lifecycle',nativePrefix=Bun.env.REVIEW_NATIVE_PREFIX??'review',alice=nativePrefix+'_alice',bob=nativePrefix+'_bob';
const ref=(element:string)=>({module:moduleId,element});
const options=()=>({version:'umf.table-migration-options/0.2' as const,backfills:[] as any[],concurrentIndexes:[] as any[],validations:[] as any[],reviewedChanges:[] as any[]});
const base=()=>legalSource(alice,bob);
function config(name:string){return {module:moduleId,schema:nativePrefix+'_'+name.replaceAll('-','_'),ownerRole:nativePrefix+'_owner',personRole:nativePrefix+'_person',batchRole:nativePrefix+'_batch',groupRoles:{billing_admin:nativePrefix+'_billing'}};}
function deploy(source:any,cfg:any){const result=compileTableDeployment({text:JSON.stringify(source),configuration:cfg});if(result.status!=='compiled')throw Error('Fixture deployment failed: '+JSON.stringify(result.diagnostics));return result.bundle;}
function mark(previous:any,next:any,kinds:readonly string[],conversions:Record<string,string>={}){
 return discoverTableMigrationChanges(previous,next).filter(candidate=>kinds.includes(candidate.kind)).map(candidate=>{
  const {oldValue:_old,newValue:_new,...value}=candidate;
  return conversions[candidate.path]?{...value,conversion:conversions[candidate.path]}:value;
 });
}
type Transition={id:string;source:any;options:any;checks:string[]};
function createCase(name:string,beforeSource:any,transitions:Transition[],checks:string[]){
 const cfg=config(name),initial=deploy(beforeSource,cfg),initialResult=compileTableMigration({id:name+'-001',predecessor:null,previous:null,next:initial});
 if(initialResult.status!=='compiled')throw Error('Fixture initial plan failed: '+JSON.stringify(initialResult.diagnostics));
 let previous=initial,predecessor={id:initialResult.plan.id,digest:initialResult.plan.digest};
 for(const transition of transitions){
  const next=deploy(transition.source,cfg),result=compileTableMigration({id:transition.id,predecessor,previous,next,options:transition.options});
  if(result.status!=='compiled')throw Error('Fixture reviewed plan failed '+transition.id+': '+JSON.stringify(result.diagnostics));
  previous=next;predecessor={id:result.plan.id,digest:result.plan.digest};
 }
 return {id:name,configuration:cfg,initialSource:beforeSource,transitions,checks};
}
function changeColumnName(source:any,fieldId:string,name:string){const result=structuredClone(source);const column=result.modules[0]!.extensions['umf.tables'].tables.flatMap((t:any)=>t.columns).find((c:any)=>c.field.element===fieldId)!;column.name=name;return result;}
function dropCourt(source:any){
 const d=structuredClone(source),m=d.modules[0]!,p=m.extensions['umf.tables'],table=p.tables.find((x:any)=>x.id==='matters')!,field='matters__court';
 table.columns=table.columns.filter((c:any)=>c.field.element!==field);m.elements.find((x:any)=>x.id==='matters')!.members=m.elements.find((x:any)=>x.id==='matters')!.members.filter((x:any)=>x.element!==field);
 p.commands.find((x:any)=>x.id==='read_matters').body.fields=p.commands.find((x:any)=>x.id==='read_matters').body.fields.filter((x:any)=>x.element!==field);
 for(const set of p.seedSets)for(const row of set.rows)if(row.table==='matters')row.values=row.values.filter((x:any)=>x.field.element!==field);
 return d;
}
function dropCourtAfterPolicyRewrite(source:any){
 const d=dropCourt(source),matter=d.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 // The retired field was an authorization principal for SELECT. The successor
 // explicitly binds the same intended person visibility to a distinct host-
 // assigned identity field before PostgreSQL drops the old policy dependency.
 matter.policy.person.select={kind:'owner',field:ref('matters__authorization_principal')};
 return d;
}
function addRank(source:any){
 const d=structuredClone(source),m=d.modules[0]!,p=m.extensions['umf.tables'],field=ref('timekeepers__internal_sequence');
 m.elements.push({id:field.element,name:field.element,description:'Synthetic integer widening probe; not business data.',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});
 m.elements.find((x:any)=>x.id==='timekeepers')!.members.push(field);p.tables.find((x:any)=>x.id==='timekeepers')!.columns.push({field,name:'internal_sequence',nativeType:{kind:'int4'}});
 p.commands.find((x:any)=>x.id==='read_timekeepers').body.fields.push(field);
 for(const set of p.seedSets)for(const row of set.rows)if(row.table==='timekeepers')row.values.push({field,value:{integerToken:'7'}});
 return d;
}
function selectKeys(source:any,recordId:string,ids:string[]){
 const d=structuredClone(source),module=d.modules[0]!,record=module.elements.find((x:any)=>x.id===recordId)!;
 record.keys.find((x:any)=>x.primary)!.fields=ids.map(ref);
 const command=module.extensions['umf.tables'].commands.find((x:any)=>x.id==='read_'+recordId)!;
 command.body.orderBy=ids.map(element=>({field:ref(element),direction:'asc'}));
 return d;
}
function selectedMarkerOptions(previous:any,next:any,kinds:readonly string[],conversions:Record<string,string>={}){
 const result=options();result.reviewedChanges=mark(previous,next,kinds,conversions);return result;
}

const cases:any[]=[];
{
 const before=base(),after=dropCourt(before),beforeBundle=deploy(before,config('drop_court')),afterBundle=deploy(after,config('drop_court'));
 cases.push(createCase('drop-court',before,[{id:'drop_court-002',source:after,options:selectedMarkerOptions(beforeBundle,afterBundle,['drop-column']),checks:['physical-court-column-removed','matter-rows-preserved']}],['reviewed-drop-applies-with-data-loss','stale-source-and-marker-refuse']));
}
{
 const before=ownerViaLegalSource(alice,bob),matterTable=before.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 const principalIndex=matterTable.columns.findIndex((c:any)=>c.field.element==='matters__authorization_principal');
 const courtIndex=matterTable.columns.findIndex((c:any)=>c.field.element==='matters__court');
 matterTable.columns.splice(principalIndex,1);matterTable.columns.splice(courtIndex,0,{field:ref('matters__authorization_principal'),name:'authorization_principal',nativeType:{kind:'text'}});
 matterTable.policy.person.select={kind:'owner',field:ref('matters__court')};
 for(const row of before.modules[0]!.extensions['umf.tables'].seedSets[0]!.rows.filter((r:any)=>r.table==='matters')){
  const id=row.values.find((v:any)=>v.field.element==='matters__matter_id')?.value?.integerToken;
  row.values.find((v:any)=>v.field.element==='matters__court')!.value={string:id==='1'?alice:bob};
 }
 const after=dropCourtAfterPolicyRewrite(before),beforeBundle=deploy(before,config('policy_drop_court')),afterBundle=deploy(after,config('policy_drop_court'));
 cases.push(createCase('policy-drop-court',before,[{id:'policy_drop_court-002',source:after,options:selectedMarkerOptions(beforeBundle,afterBundle,['drop-column','change-policy']),checks:['policy-rewrite-precedes-column-drop','person-visibility-preserved-after-policy-rewrite']}],['native-policy-dependency-rewrite-before-drop']));
}
{
 const before=base(),after=changeColumnName(before,'matters__court','court_name'),beforeBundle=deploy(before,config('rename_court')),afterBundle=deploy(after,config('rename_court'));
 cases.push(createCase('rename-court',before,[{id:'rename_court-002',source:after,options:selectedMarkerOptions(beforeBundle,afterBundle,['rename-column']),checks:['rename-preserves-existing-rows']}],['physical-rename-preserves-values']));
}
{
 const before=addRank(base()),after=structuredClone(before),module=after.modules[0]!,timekeepers=module.extensions['umf.tables'].tables.find((x:any)=>x.id==='timekeepers')!;
 const rate=module.elements.find((x:any)=>x.id==='timekeepers__billing_rate')!;rate.facets={precision:12,scale:2};timekeepers.columns.find((x:any)=>x.field.element===rate.id)!.nativeType={kind:'numeric',precision:12,scale:2};
 timekeepers.columns.find((x:any)=>x.field.element==='timekeepers__internal_sequence')!.nativeType={kind:'int8'};
 const beforeBundle=deploy(before,config('widen_types')),afterBundle=deploy(after,config('widen_types'));
 const conversions={'/modules/0/extensions/umf.tables/tables/1/columns/3':'pg-cast-v1','/modules/0/extensions/umf.tables/tables/1/columns/4':'pg-cast-v1'};
 cases.push(createCase('widen-types',before,[{id:'widen_types-002',source:after,options:selectedMarkerOptions(beforeBundle,afterBundle,['change-column-type'],conversions),checks:['numeric-and-integer-widening-preserves-values']}],['numeric-and-int-widen-preserve-values','narrowing-and-facet-change-refuse']));
}
{
 const before=base();for(const set of before.modules[0]!.extensions['umf.tables'].seedSets)for(const row of set.rows)if(row.table==='matters')for(const value of row.values)if(value.field.element==='matters__close_date')value.value={date:'2026-12-31'};
 const tight=structuredClone(before),tightField=tight.modules[0]!.elements.find((x:any)=>x.id==='matters__close_date')!;tightField.nullability='required';
 const beforeBundle=deploy(before,config('not_null')),tightBundle=deploy(tight,config('not_null'));
 const tightOptions=selectedMarkerOptions(beforeBundle,tightBundle,['tighten-not-null']);
 const relaxed=structuredClone(tight);relaxed.modules[0]!.elements.find((x:any)=>x.id==='matters__close_date')!.nullability='absent-allowed';
 const relaxedBundle=deploy(relaxed,config('not_null'));
 const relaxedOptions=selectedMarkerOptions(tightBundle,relaxedBundle,['relax-not-null']);
 cases.push(createCase('not-null',before,[{id:'not_null-002',source:tight,options:tightOptions,checks:['not-null-tightening-preserves-values']},{id:'not_null-003',source:relaxed,options:relaxedOptions,checks:['not-null-relaxation-observed']}],['tighten-and-relax-not-null']));
}
{
 const before=base(),added=structuredClone(before),matterTable=added.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='matters')!;
 matterTable.indexes.push({id:'client_lookup',name:'matters_client_lookup',fields:[ref('matters__client_id')],unique:false,include:[]});
 const options1=options();options1.concurrentIndexes=[{table:'matters',index:'client_lookup'}];
 const renamed=structuredClone(added);renamed.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='matters')!.indexes.find((x:any)=>x.id==='client_lookup')!.name='matters_client_lookup_v2';
 const b1=deploy(before,config('replace_index')),b2=deploy(added,config('replace_index')),b3=deploy(renamed,config('replace_index'));
 const options2=selectedMarkerOptions(b2,b3,['replace-index']);
 cases.push(createCase('replace-index',before,[{id:'replace_index-002',source:added,options:options1,checks:['initial-index-created']},{id:'replace_index-003',source:renamed,options:options2,checks:['index-replaced']}],['reviewed-index-replacement-observed']));
}
{
 const before=base(),indexed=structuredClone(before),table=indexed.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='matters')!;
 table.indexes.push({id:'client_lookup',name:'matters_client_lookup',fields:[ref('matters__client_id')],unique:false,include:[]});
 const removed=structuredClone(indexed);removed.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='matters')!.indexes=[];
 const b1=deploy(before,config('remove_index')),b2=deploy(indexed,config('remove_index')),b3=deploy(removed,config('remove_index'));
 cases.push(createCase('remove-index',indexed,[{id:'remove_index-002',source:removed,options:selectedMarkerOptions(b2,b3,['replace-index']),checks:['standalone-index-removed']}],['reviewed-standalone-index-removal-observed']));
}
{
 const before=base(),indexed=structuredClone(before),table=indexed.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='matters')!;
 table.indexes.push({id:'client_lookup',name:'matters_client_lookup',fields:[ref('matters__client_id')],unique:false,include:[]});
 const successor=structuredClone(indexed),nextTable=successor.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='matters')!;
 nextTable.indexes[0]!.id='client_lookup_successor';nextTable.indexes[0]!.name='matters_client_lookup_successor';
 const b1=deploy(indexed,config('index_newid')),b2=deploy(successor,config('index_newid'));
 cases.push(createCase('index-newid-successor',indexed,[{id:'index_newid_successor-002',source:successor,options:selectedMarkerOptions(b1,b2,['replace-index']),checks:['old-index-dropped-new-id-index-created']}],['same-count-new-id-index-recreation-observed']));
}
{
 const before=evolvedLegalSource().source,tableId='matters',findTable=(s:any)=>s.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id===tableId)!;
 const changed=structuredClone(before),check=findTable(changed).checks.find((c:any)=>c.id==='positive_id')!;
 check.expression.right.value.integerToken='-1';
 const renamed=structuredClone(changed);findTable(renamed).checks.find((c:any)=>c.id==='positive_id')!.name='matters_positive_id_v2';
 const removed=structuredClone(renamed);findTable(removed).checks=[];
 const b1=deploy(before,config('check_lifecycle')),b2=deploy(changed,config('check_lifecycle')),b3=deploy(renamed,config('check_lifecycle')),b4=deploy(removed,config('check_lifecycle'));
 cases.push(createCase('check-lifecycle',before,[
  {id:'check_lifecycle-002',source:changed,options:selectedMarkerOptions(b1,b2,['replace-check']),checks:['check-expression-replaced-preserving-rows']},
  {id:'check_lifecycle-003',source:renamed,options:selectedMarkerOptions(b2,b3,['replace-check']),checks:['check-native-name-renamed-preserving-rows']},
  {id:'check_lifecycle-004',source:removed,options:selectedMarkerOptions(b3,b4,['replace-check']),checks:['check-removed-preserving-rows']},
 ],['check-change-rename-removal']));
}
{
 const before=base(),tableId='matter_teams',findTable=(s:any)=>s.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id===tableId)!;
 const changed=structuredClone(before);findTable(changed).foreignKeys[0]!.onDelete='cascade';
 const renamed=structuredClone(changed);findTable(renamed).foreignKeys[0]!.name='matter_teams_fk_renamed';
 const replaced=structuredClone(renamed),fk=findTable(replaced).foreignKeys[0]!;fk.id='fk_successor';fk.name='matter_teams_fk_successor';fk.onUpdate='cascade';
 const removed=structuredClone(replaced);findTable(removed).foreignKeys=[];
 const b1=deploy(before,config('foreign_key_lifecycle')),b2=deploy(changed,config('foreign_key_lifecycle')),b3=deploy(renamed,config('foreign_key_lifecycle')),b4=deploy(replaced,config('foreign_key_lifecycle')),b5=deploy(removed,config('foreign_key_lifecycle'));
 cases.push(createCase('foreign-key-lifecycle',before,[
  {id:'foreign_key_lifecycle-002',source:changed,options:selectedMarkerOptions(b1,b2,['replace-foreign-key']),checks:['foreign-key-action-replaced-preserving-rows']},
  {id:'foreign_key_lifecycle-003',source:renamed,options:selectedMarkerOptions(b2,b3,['replace-foreign-key']),checks:['foreign-key-native-name-renamed-preserving-rows']},
  {id:'foreign_key_lifecycle-004',source:replaced,options:selectedMarkerOptions(b3,b4,['replace-foreign-key']),checks:['foreign-key-new-id-successor-recreated']},
  {id:'foreign_key_lifecycle-005',source:removed,options:selectedMarkerOptions(b4,b5,['replace-foreign-key']),checks:['foreign-key-removed-preserving-rows']},
 ],['foreign-key-change-rename-new-id-replacement-removal']));
}
{
 const before=base(),after=selectKeys(before,'matter_teams',['matter_teams__matter_id','matter_teams__database_role']),beforeBundle=deploy(before,config('replace_pk')),afterBundle=deploy(after,config('replace_pk'));
 cases.push(createCase('replace-pk',before,[{id:'replace_pk-002',source:after,options:selectedMarkerOptions(beforeBundle,afterBundle,['replace-primary-key']),checks:['independent-primary-key-replaced']}],['primary-key-replacement-without-dependents']));
}
{
 const before=base(),after=structuredClone(before),clients=after.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='clients')!;
 clients.policy.person.select={kind:'memberOfRole',role:'billing_admin'};clients.policy.person.insert={kind:'allow'};
 const beforeBundle=deploy(before,config('policy')),afterBundle=deploy(after,config('policy'));
 cases.push(createCase('policy',before,[{id:'policy-002',source:after,options:selectedMarkerOptions(beforeBundle,afterBundle,['change-policy']),checks:['actual-reads-and-grants-follow-policy']}],['policy-predicate-and-grant-change-observed']));
}

const invalidPkBase=base();
const duplicateMembership=invalidPkBase.modules[0]!.extensions['umf.tables'].seedSets[0]!.rows.find((r:any)=>r.table==='matter_teams'&&r.values.some((v:any)=>v.field.element==='matter_teams__matter_id'&&v.value.integerToken==='2'))!;
duplicateMembership.values.find((v:any)=>v.field.element==='matter_teams__matter_id')!.value={integerToken:'1'};
duplicateMembership.values.find((v:any)=>v.field.element==='matter_teams__database_role')!.value={string:alice};
const invalidPkNext=selectKeys(invalidPkBase,'matter_teams',['matter_teams__matter_id','matter_teams__database_role']);
const invalidPkBeforeBundle=deploy(invalidPkBase,config('invalid_pk')),invalidPkAfterBundle=deploy(invalidPkNext,config('invalid_pk'));
const invalidPkCase=createCase('invalid-pk',invalidPkBase,[{id:'invalid_pk-002',source:invalidPkNext,options:selectedMarkerOptions(invalidPkBeforeBundle,invalidPkAfterBundle,['replace-primary-key']),checks:['invalid-primary-key-data-rolls-back']}],['invalid-existing-key-values-refuse-atomically']);
cases.push({...invalidPkCase,nativeFailure:'primary-key'});

const nullFailureBase=base();for(const set of nullFailureBase.modules[0]!.extensions['umf.tables'].seedSets)for(const row of set.rows)if(row.table==='matters')for(const value of row.values)if(value.field.element==='matters__close_date')value.value={date:'2026-12-31'};
const nullFailureNext=structuredClone(nullFailureBase);
nullFailureNext.modules[0]!.elements.find((x:any)=>x.id==='matters__close_date')!.nullability='required';
const nullFailureBefore=deploy(nullFailureBase,config('not_null_failure')),nullFailureAfter=deploy(nullFailureNext,config('not_null_failure'));
const nullFailureCase=createCase('not-null-failure',nullFailureBase,[{id:'not_null_failure-002',source:nullFailureNext,options:selectedMarkerOptions(nullFailureBefore,nullFailureAfter,['tighten-not-null']),checks:['native-null-failure-rolls-back']}],['not-null-failure-rolls-back']);
cases.push({...nullFailureCase,nativeFailure:'not-null'});

const inboundBase=base(),inboundNext=selectKeys(inboundBase,'matters',['matters__client_id']);
const inboundBefore=deploy(inboundBase,config('inbound_pk')),inboundAfter=deploy(inboundNext,config('inbound_pk'));
const inboundCandidate=mark(inboundBefore,inboundAfter,['replace-primary-key']);
if(inboundCandidate.length!==1)throw Error('Expected one inbound primary-key replacement marker.');
const narrowBase=addRank(base()),narrowNext=structuredClone(narrowBase),narrowTable=narrowNext.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='timekeepers')!;
narrowNext.modules[0]!.elements.find((x:any)=>x.id==='timekeepers__billing_rate')!.facets={precision:5,scale:2};
narrowTable.columns.find((x:any)=>x.field.element==='timekeepers__billing_rate')!.nativeType={kind:'numeric',precision:5,scale:2};
const narrowBefore=deploy(narrowBase,config('narrow_numeric')),narrowAfter=deploy(narrowNext,config('narrow_numeric'));
const narrowOptions=selectedMarkerOptions(narrowBefore,narrowAfter,['change-column-type'],{'/modules/0/extensions/umf.tables/tables/1/columns/3':'pg-cast-v1'});

const sourceOutput={version:'umf.praxis.reviewed-native-fixture/1',principals:{alice,bob},cases,negativeCases:[
 {id:'inbound-pk',configuration:config('inbound_pk'),previousSource:inboundBase,nextSource:inboundNext,options:{...options(),reviewedChanges:inboundCandidate},expectation:'compiler-refuses-inbound-foreign-key-dependency'},
 {id:'narrow-numeric',configuration:config('narrow_numeric'),previousSource:narrowBase,nextSource:narrowNext,options:narrowOptions,expectation:'compiler-refuses-narrowing'},
]};
await Bun.write(process.argv[2]??'/private/tmp/umf-reviewed-native-fixture.json',JSON.stringify(sourceOutput,null,2)+'\n');
console.log(JSON.stringify({cases:cases.map(x=>({id:x.id,transitions:x.transitions.length})),negativeCases:sourceOutput.negativeCases.map(x=>x.id)}));
