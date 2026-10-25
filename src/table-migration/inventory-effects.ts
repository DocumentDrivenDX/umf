import {canonical,hashCanonical} from '../compilation/bundle/hash';
import type {TableDeploymentBundle} from '../table-deployment';
import type {InternalTableDeploymentOperationRecord} from '../table-deployment/types';
import {compileG02FieldEffects} from './internal';
import {renderG02GrantEffect} from './g02-field-effects';
import {deriveTableGrantEffectRow,type TableGrantEffectRow} from '../table-deployment/grants';
import type {TableDeclaration,TableRef} from '../extensions/tables/types';
import {columnDefinitionSql} from '../table-deployment/sql';
import type {TableMigrationOptions} from './options';
import type {CatalogProjection,PrefixCatalog} from './inventory-source';
import type {CatalogMutation} from './inventory-graph';
import {inventoryCatalogIdentity,type EffectNode,type InventorySubject,type TypedDependency} from './inventory-graph';

type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
type Identity={kind:string;table:string|null;subject:Json};
type Subject={identity:Identity;meaning:Json;state:'present'|'absent';validation?:string;validity?:string};
const clone=<T>(value:T):T=>structuredClone(value);
const obj=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hashSubject=(identity:Identity)=>hashCanonical(identity);
const catalogRows=(catalog:PrefixCatalog,collection:string):Subject[]=>catalog[collection as keyof PrefixCatalog] as Subject[];
function sourceBoundPersonUpdateGrant(bundle:TableDeploymentBundle,tableId:string,sourcePath:string,meaning:any,identity:Identity):TableGrantEffectRow{
 if(bundle.source.format!=='json')throw new Error('G10_G02_GRANT_SOURCE_FORMAT');
 let document:any;try{document=JSON.parse(bundle.source.utf8);}catch{throw new Error('G10_G02_GRANT_SOURCE_PARSE');}
 const moduleIndex=document.modules?.findIndex((module:any)=>module.id===bundle.module)??-1,module=document.modules?.[moduleIndex],payload=module?.extensions?.['umf.tables'],tables=payload?.tables;
 if(moduleIndex<0||!Array.isArray(tables))throw new Error('G10_G02_GRANT_SOURCE_BINDING');
 const matches=tables.map((table:any,index:number)=>({table,index})).filter(({table}:any)=>table?.id===tableId);
 if(matches.length!==1)throw new Error('G10_G02_GRANT_SOURCE_BINDING');
 const {table,index}=matches[0] as {table:TableDeclaration;index:number},expectedPath=`/modules/${moduleIndex}/extensions/umf.tables/tables/${index}/policy/person/update`;
 const meaningKeys=Object.keys(meaning).sort(),expectedMeaningKeys=['columns','effect','grantOption','privilege','role','rule','sourcePath','state','table'];
 if(meaningKeys.length!==expectedMeaningKeys.length||meaningKeys.some((key,index)=>key!==expectedMeaningKeys[index])||sourcePath!==expectedPath||meaning.sourcePath!==expectedPath||meaning.state!=='present'||meaning.effect!=='grant'||meaning.table!==tableId||meaning.privilege!=='update'||meaning.grantOption!==false||table.policy.person.update.kind==='deny')throw new Error('G10_G02_GRANT_SOURCE_BINDING');
 const recordModule=document.modules.find((candidate:any)=>candidate.id===table.record.module),record=recordModule?.elements.find((element:any)=>element.kind==='record'&&element.id===table.record.element);
 if(!record)throw new Error('G10_G02_GRANT_SOURCE_RECORD');
 let expected:TableGrantEffectRow;
 try{expected=deriveTableGrantEffectRow({table,recordModule:table.record.module,record,schema:bundle.configuration.schema,role:bundle.configuration.personRole,audience:'person',command:'update'});}
 catch{throw new Error('G10_G02_GRANT_SOURCE_ROW');}
 if(canonical({table:meaning.table,role:meaning.role,privilege:meaning.privilege,columns:meaning.columns,grantOption:meaning.grantOption,rule:meaning.rule})!==canonical({table:expected.table,role:expected.role,privilege:expected.privilege,columns:expected.columns,grantOption:expected.grantOption,rule:table.policy.person.update})||expected.schema!==bundle.configuration.schema||expected.relation!==bundle.expectedCatalog.tables.find(item=>item.id===tableId)?.name||identity.table!==tableId||canonical(identity.subject)!==canonical([expected.role,expected.privilege,expected.columns]))throw new Error('G10_G02_GRANT_SOURCE_ROW');
 return expected;
}
function findSubject(catalog:PrefixCatalog,collection:string,identity:Identity):Subject{
 const matches=catalogRows(catalog,collection).filter(row=>hashSubject(row.identity)===hashSubject(identity));
 if(matches.length!==1)throw new Error('G10_RENDERED_SUBJECT_NOT_UNIQUE:'+collection+':'+hashSubject(identity));return matches[0]!;
}
function dependencyIdentity(operation:InternalTableDeploymentOperationRecord):{collection:string;identity:Identity}{
 const subject=operation.subject;
 switch(operation.operation){
  case'add-foreign-key':if(subject.kind!=='foreignKey')throw new Error('G10_RENDERED_FK_SUBJECT');return {collection:'foreignKeys',identity:{kind:'foreignKey',table:subject.table,subject:subject.id}};
  case'add-index':if(subject.kind!=='index')throw new Error('G10_RENDERED_INDEX_SUBJECT');return {collection:'indexes',identity:{kind:'index',table:subject.table,subject:subject.id}};
  case'revoke-public':if(subject.kind!=='publicGrant')throw new Error('G10_RENDERED_PUBLIC_GRANT_SUBJECT');return {collection:'grants',identity:{kind:'grant',table:subject.table,subject:['PUBLIC','all',null]}};
  case'create-policy':if(subject.kind!=='policy')throw new Error('G10_RENDERED_POLICY_SUBJECT');return {collection:'policies',identity:{kind:'policy',table:subject.table,subject:[subject.audience,subject.command]}};
  case'grant-table':if(subject.kind!=='tableGrant')throw new Error('G10_RENDERED_TABLE_GRANT_SUBJECT');return {collection:'grants',identity:{kind:'grant',table:subject.table,subject:[subject.role,subject.privilege,subject.columns]}};
  case'set-comment':if(subject.kind!=='comment')throw new Error('G10_RENDERED_COMMENT_SUBJECT');return {collection:'comments',identity:{kind:'comment',table:subject.table,subject:subject.column===null?['table']:['column',subject.column]}};
  default:throw new Error('G10_RENDERED_NOT_DEPENDENCY:'+operation.operation);
 }
}
function node(operation:InternalTableDeploymentOperationRecord,sourceOrder:number,atomicGroup:string|null,kind:string,subject:EffectNode['subject'],transition:EffectNode['transition']):EffectNode{
 return {id:operation.stepId,kind,operation:operation.operation==='create-table'?'create-table':operation.operation==='enable-rls'?'enable-rls':operation.operation==='force-rls'?'force-rls':operation.operation==='set-comment'?'set-comment':'dependency-add',subject,sourcePath:operation.sourcePath,sql:operation.sql,transaction:operation.transaction,recovery:'rollback-transaction',sourceOrder,atomicGroup,transition};
}
/** Translate exact typed renderer tags into prefix effects. It never inspects SQL text. */
export function deriveInitialRendererEffects(bundle:TableDeploymentBundle,projection:CatalogProjection,previous:CatalogProjection|null=null):{effects:EffectNode[];edges:TypedDependency[]}{
 const effects:EffectNode[]=[],creationGroup='initial-table-install',existingTables=new Set(previous?.catalog.tables.map(row=>row.identity.table).filter((x):x is string=>x!==null)??[]),createdTables=new Set(projection.catalog.tables.map(row=>row.identity.table).filter((x):x is string=>x!==null).filter(table=>!existingTables.has(table))),grantOperation=previous===null?projection.rendererOperations.find(item=>item.operation==='grant-schema-usage'):undefined;
 for(const [sourceOrder,operation] of projection.rendererOperations.entries()){
  if(operation.operation==='grant-schema-usage')continue;
  const operationTable=operation.subject.kind==='schema-grant'?null:'table' in operation.subject?operation.subject.table:null;
  if(operationTable!==null&&!createdTables.has(operationTable))continue;
  if(operationTable===null)throw new Error('G10_RENDERED_SUBJECT_TABLE');
  if(operation.operation==='create-table'){
   if(operation.subject.kind!=='table')throw new Error('G10_RENDERED_CREATE_SUBJECT');
   const tableId=operation.subject.table,tableRecord=operation.subject.record;
   const table=findSubject(projection.catalog,'tables',{kind:'table',table:tableId,subject:tableRecord as unknown as Json});
   const embedded={columns:projection.catalog.columns.filter(row=>row.identity.table===tableId),keys:projection.catalog.keys.filter(row=>row.identity.table===tableId),checks:projection.catalog.checks.filter(row=>row.identity.table===tableId)};
   const meaning={tableMeaning:clone(table.meaning),embeddedCatalog:clone(embedded)} as unknown as Json;
   effects.push(node(operation,sourceOrder,creationGroup,'table',{kind:'table',table:tableId,record:clone(tableRecord)},{action:'add',collection:'tables',meaning}));
   continue;
  }
  if(operation.operation==='enable-rls'||operation.operation==='force-rls'){
   if(operation.subject.kind!=='tableState')throw new Error('G10_RENDERED_RLS_SUBJECT');
   const tableId=operation.subject.table,tableRecord=operation.subject.record;const table=findSubject(projection.catalog,'tables',{kind:'table',table:tableId,subject:tableRecord as unknown as Json}),meaning=clone(table.meaning) as any;
   meaning.rls={enabled:true,forced:operation.operation==='force-rls'};
   effects.push(node(operation,sourceOrder,creationGroup,'table',{kind:'table',table:tableId,record:clone(tableRecord)},{action:'update',collection:'tables',meaning:meaning as Json}));
   continue;
  }
  const {collection,identity}=dependencyIdentity(operation),subject=findSubject(projection.catalog,collection,identity);
  const effectKind=operation.kind;
  const dependencyKind=collection==='foreignKeys'?'foreignKey':collection==='indexes'?'index':collection==='policies'?'policy':collection==='comments'?'comment':'grant';const effectId=['policy','comment','grant'].includes(dependencyKind)?JSON.stringify(identity.subject):String(identity.subject);const effectSubject:EffectNode['subject']={kind:'dependency',table:identity.table!,dependencyKind,id:effectId,sourcePath:operation.sourcePath,meaningDigest:hashCanonical(subject.meaning)};
  effects.push(node(operation,sourceOrder,creationGroup,effectKind,effectSubject,{action:'add',collection:collection as EffectNode['transition']['collection'],meaning:{catalogMeaning:clone(subject.meaning),validation:subject.validation??null,validity:subject.validity??null} as unknown as Json}));
 }
 if(grantOperation){
  if(grantOperation.subject.kind!=='schema-grant'||grantOperation.subject.schema!==bundle.configuration.schema||grantOperation.subject.privilege!=='USAGE'||JSON.stringify(grantOperation.subject.audiences)!==JSON.stringify(['person','batch']))throw new Error('G10_RENDERED_SCHEMA_GRANT_SUBJECT');
  const schemaGrants=projection.catalog.grants.filter(row=>row.identity.table===null&&((row.meaning as any).effect==='grant-schema-usage'));
  if(schemaGrants.length!==2||new Set(schemaGrants.map(row=>(row.meaning as any).role)).size!==2)throw new Error('G10_RENDERED_SCHEMA_GRANT_ROWS');
  effects.push(node(grantOperation,projection.rendererOperations.length,null,'grant',{kind:'schema-grant',schema:grantOperation.subject.schema,audiences:['person','batch'],privilege:'USAGE'},{action:'add',collection:'grants',meaning:{grants:schemaGrants.map(row=>({identity:clone(row.identity),meaning:clone(row.meaning)}))} as unknown as Json}));
 }
 const edges:TypedDependency[]=projection.dependencies.filter(edge=>edge.state==='present').filter(edge=>{const touchesCreated=(identityDigest:string)=>{for(const table of createdTables){const tableHash=hashCanonical({kind:'table',table,subject:projection.catalog.tables.find(row=>row.identity.table===table)?.identity.subject});if(identityDigest===tableHash)return true;for(const collection of Object.values(projection.catalog))for(const row of collection)if(row.identity.table===table&&hashCanonical(row.identity)===identityDigest)return true;}return false;};return touchesCreated(edge.from)||touchesCreated(edge.to);}).map(edge=>({dependent:edge.from,prerequisite:edge.to,sourcePath:edge.sourcePath,reason:edge.reason,state:edge.state}));
 if(grantOperation){
  const grant=effects.at(-1)!;for(const prior of effects.slice(0,-1))edges.push({dependent:hashSubject(inventoryCatalogIdentity(grant.subject)),prerequisite:hashSubject(inventoryCatalogIdentity(prior.subject)),sourcePath:grant.sourcePath,reason:'schema-grant-after-required-effects',state:'present'});
 }
 return {effects,edges};
}

/** Rebind only compiler-owned diagnostic coordinates on otherwise identical retained rows. */
export function deriveG10ProvenanceMutations(previous:CatalogProjection|null,next:CatalogProjection,effects:readonly EffectNode[]):CatalogMutation[]{
 if(!previous)return [];
 const touched=new Set<string>();
 for(const effect of effects){touched.add(hashCanonical(inventoryCatalogIdentity(effect.subject)));for(const mutation of effect.catalogMutations??[])touched.add(hashCanonical(mutation.identity));}
 const out:CatalogMutation[]=[];
 const pathSlot=(collection:string,row:Subject):{container:Record<string,any>;key:string}|null=>{
  const meaning=row.meaning as any;
  if(['columns','keys','checks','foreignKeys','indexes','comments'].includes(collection)&&meaning&&typeof meaning==='object'&&meaning.expectation&&typeof meaning.expectation==='object'&&Object.hasOwn(meaning.expectation,'sourcePath'))return {container:meaning.expectation,key:'sourcePath'};
  if((collection==='policies'||collection==='grants')&&meaning&&typeof meaning==='object'&&Object.hasOwn(meaning,'sourcePath'))return {container:meaning,key:'sourcePath'};
  return null;
 };
 const rowJson=(row:Subject):Json=>({identity:clone(row.identity) as unknown as Json,meaning:clone(row.meaning),state:row.state,...(row.validation===undefined?{}:{validation:row.validation}),...(row.validity===undefined?{}:{validity:row.validity})});
 for(const collection of ['columns','keys','checks','foreignKeys','indexes','policies','grants','comments'] as const){
  const oldRows=previous.catalog[collection],newRows=next.catalog[collection];
  for(const oldRow of oldRows){if(oldRow.identity.table===null||touched.has(hashCanonical(inventoryCatalogIdentityFromCatalog(oldRow.identity))))continue;const candidates=newRows.filter(row=>canonical(row.identity)===canonical(oldRow.identity));if(candidates.length!==1)continue;const fresh=candidates[0]!,oldSlot=pathSlot(collection,oldRow),newSlot=pathSlot(collection,fresh);if(!oldSlot||!newSlot)continue;const beforePath=oldSlot.container[oldSlot.key],afterPath=newSlot.container[newSlot.key];if(typeof beforePath!=='string'||typeof afterPath!=='string'||beforePath===afterPath)continue;
   const before=rowJson(oldRow),after=rowJson(fresh),beforeMeaning=(before as any).meaning,newMeaning=(after as any).meaning;
   if(['columns','keys','checks','foreignKeys','indexes','comments'].includes(collection)){delete beforeMeaning.expectation.sourcePath;delete newMeaning.expectation.sourcePath;}else{delete beforeMeaning.sourcePath;delete newMeaning.sourcePath;}
   if(canonical(before)!==canonical(after))throw new Error('G10_PROVENANCE_NONPATH_CHANGE:'+collection);
   const mutation:CatalogMutation={collection,action:'replace',identity:clone(oldRow.identity) as unknown as Json,before:rowJson(oldRow),after:rowJson(fresh)};out.push(mutation);
  }
 }
 return out;
}

function inventoryCatalogIdentityFromCatalog(value:Identity):InventorySubject{
 const subject=value.subject;
 if(value.kind==='table'&&value.table!==null&&obj(subject)&&typeof subject.module==='string'&&typeof subject.element==='string')return {kind:'table',table:value.table,record:{module:subject.module,element:subject.element}};
 if(value.kind==='column'&&value.table!==null&&obj(subject)&&typeof subject.module==='string'&&typeof subject.element==='string')return {kind:'field',table:value.table,field:{module:subject.module,element:subject.element}};
 if(value.table!==null){const dependencyKind=value.kind==='foreignKey'?'foreignKey':value.kind==='index'?'index':value.kind==='policy'?'policy':value.kind==='grant'?'grant':value.kind==='check'?'check':value.kind==='key'?'key':value.kind==='comment'?'comment':undefined;if(dependencyKind){const id=['policy','grant','comment'].includes(dependencyKind)?JSON.stringify(value.subject):String(value.subject);return {kind:'dependency',table:value.table,dependencyKind,id,sourcePath:'/',meaningDigest:'0'.repeat(64)};}}
 return {kind:'metadata',profile:'umf.table-inventory-metadata/0.1'};
}

/** Lower only G02 .4 fills on retained carriers; no legacy migration plan is
 * synthesized. The internal constructor verifies exact effects against both
 * complete original bundles and the selected new-table bindings. */
export function deriveG02FieldEffects(previous:TableDeploymentBundle,next:TableDeploymentBundle,previousProjection:CatalogProjection,nextProjection:CatalogProjection,options:TableMigrationOptions,sourceOrder:number):{effects:EffectNode[];edges:TypedDependency[]}{
 const records=compileG02FieldEffects({previous,next,options,createdTables:nextProjection.catalog.tables.map(row=>row.identity.table).filter((table):table is string=>table!==null&&!previousProjection.catalog.tables.some(old=>old.identity.table===table))});
 if(!records.length||records.some(record=>record.field.module!==records[0]!.field.module||record.field.element!==records[0]!.field.element||record.table!==records[0]!.table))throw new Error('G10_G02_TYPED_EFFECT_SHAPE');
 const field=records[0]!.field,table=records[0]!.table,fill=records.find(record=>record.role==='backfill');
 if(!fill?.rowOperationId)throw new Error('G10_G02_EFFECT_BINDING');
 const target=nextProjection.catalog.columns.filter(row=>row.identity.table===table&&canonical(row.identity.subject)===canonical(field));
 const old=previousProjection.catalog.columns.filter(row=>row.identity.table===table&&canonical(row.identity.subject)===canonical(field));
 if(target.length!==1||!target[0]!.meaning||old.length>1||old.length===1&&!old[0]!.meaning)throw new Error('G10_G02_COLUMN_PREFIX_BINDING');
 const oldColumn=old.length===1;
 const tableBindings=next.expectedCatalog.tables.filter(candidate=>candidate.id===table),columns=tableBindings[0]?.columns.filter(column=>canonical(column.field)===canonical(field))??[];
 if(tableBindings.length!==1||columns.length!==1)throw new Error('G10_G02_DDL_BINDING');
 const bindingKey=hashCanonical([table,field.module,field.element]).slice(0,24),group=`g02-fill:${bindingKey}`,subject:EffectNode['subject']={kind:'field',table,field},effects:EffectNode[]=[];
 const effectSubjects:EffectNode['subject'][]=[];
 const stagedMeaning=(stage:'added'|'defaulted'):Json=>{
  const meaning=clone(target[0]!.meaning) as any;
  if(!meaning||typeof meaning!=='object'||!meaning.column||!meaning.expectation||typeof meaning.expectation!=='object')throw new Error('G10_G02_COLUMN_MEANING_SHAPE');
  const column=clone(columns[0]!) as any;
  if(stage==='added')delete column.default;
  meaning.column=column;meaning.expectation.nullable=true;meaning.expectation.definitionSql=columnDefinitionSql(column,true);
  return meaning as Json;
 };
 for(const [offset,record] of records.entries()){
  const common={id:`g02-${bindingKey}-${record.role}-${offset}`,kind:'table',subject,sourcePath:record.sourcePath,sql:record.sql,transaction:'required' as const,recovery:'rollback-transaction' as const,sourceOrder:sourceOrder+offset+1,atomicGroup:group};
  if(record.role==='backfill')effects.push({...common,kind:'backfill',operation:'apply-backfill',sql:'',dataBinding:{profile:'umf.table-inventory-backfill/0.1',selectionIndex:0,operationId:record.rowOperationId!,previousSourceDigest:previous.sourceDigest,nextSourceDigest:next.sourceDigest},transition:{action:'update',collection:'columns',meaning:{}}});
  else if(record.role==='add-column'){
   const addEffect:EffectNode={...common,operation:'add-column',transition:{action:'add',collection:'columns',meaning:{catalogMeaning:stagedMeaning('added'),validation:null,validity:null}}};
   if(!oldColumn){const tableRecord=tableBindings[0]!.record,tableIdentity={kind:'table',table,subject:tableRecord as unknown as Json},before=findSubject(previousProjection.catalog,'tables',tableIdentity),after=findSubject(nextProjection.catalog,'tables',tableIdentity),mutation:CatalogMutation={collection:'tables',action:'replace',identity:tableIdentity as unknown as Json,before:{identity:before.identity as unknown as Json,meaning:before.meaning,state:before.state},after:{identity:after.identity as unknown as Json,meaning:after.meaning,state:after.state}};addEffect.catalogMutations=[mutation];}
   effects.push(addEffect);
  }
  else if(record.role==='target-check'){
   const domainId=`domain:${field.module}.${field.element}`;
   const check=nextProjection.catalog.checks.filter(row=>{const meaning=row.meaning;return row.identity.table===table&&row.identity.subject===domainId&&obj(meaning)&&canonical(meaning.field)===canonical(field);});
   if(check.length!==1)throw new Error('G10_G02_TARGET_CHECK_BINDING');
   if(record.operation==='add-not-valid')throw new Error('G10_G02_UNSUPPORTED_DEFERRED_CHECK_VALIDATION');
   effects.push({...common,subject,operation:'target-check',transition:{action:'add',collection:'checks',meaning:{catalogMeaning:clone(check[0]!.meaning),validation:check[0]!.validation??null,validity:check[0]!.validity??null}}});
   effectSubjects.push(subject);continue;
  }else if(record.role==='validate-target-check'){
   const domainId=`domain:${field.module}.${field.element}`;
   const check=nextProjection.catalog.checks.filter(row=>{const meaning=row.meaning;return row.identity.table===table&&row.identity.subject===domainId&&obj(meaning)&&canonical(meaning.field)===canonical(field);});
   if(check.length!==1)throw new Error('G10_G02_TARGET_CHECK_BINDING');
   throw new Error('G10_G02_UNSUPPORTED_DEFERRED_CHECK_VALIDATION');
  }else if(record.role==='install-default')effects.push({...common,operation:'install-default',transition:{action:'update',collection:'columns',meaning:stagedMeaning('defaulted')}});
  else if(record.role==='tighten-not-null')effects.push({...common,operation:'tighten-not-null',transition:{action:'update',collection:'columns',meaning:clone(target[0]!.meaning)}});
  else throw new Error('G10_G02_UNSUPPORTED_RENDERED_ROLE');
  effectSubjects.push(subject);
 }
 const edges:TypedDependency[]=[];
 for(const [index,effect] of effects.entries())if(index>0)edges.push({dependent:hashCanonical(inventoryCatalogIdentity(effectSubjects[index]!)),prerequisite:hashCanonical(inventoryCatalogIdentity(effectSubjects[index-1]!)),sourcePath:effect.sourcePath,reason:`g02-effect-order:${records[index-1]!.role}:${records[index]!.role}`,state:'present'});
 const oldGrant=previousProjection.catalog.grants.filter(row=>row.identity.table===table&&(row.meaning as any).role===previous.configuration.personRole&&(row.meaning as any).privilege==='update'&&(row.meaning as any).effect==='grant'),newGrant=nextProjection.catalog.grants.filter(row=>row.identity.table===table&&(row.meaning as any).role===next.configuration.personRole&&(row.meaning as any).privilege==='update'&&(row.meaning as any).effect==='grant');
 if(oldGrant.length===0&&newGrant.length===0){}
 else if(oldGrant.length!==1||newGrant.length!==1)throw new Error('G10_G02_PERSON_UPDATE_GRANT_CARDINALITY');
 else if(canonical(oldGrant[0]!.identity)!==canonical(newGrant[0]!.identity)){
  const declaration=next.expectedCatalog.tables.find(item=>item.id===table);if(!declaration)throw new Error('G10_G02_GRANT_TABLE');
  const priorDeclaration=previous.expectedCatalog.tables.find(item=>item.id===table);if(!priorDeclaration)throw new Error('G10_G02_GRANT_TABLE');
  const oldColumns=(oldGrant[0]!.meaning as any).columns as unknown[],nextColumns=(newGrant[0]!.meaning as any).columns as unknown[];
  const names=(items:unknown[])=>{if(items.some(value=>typeof value!=='string')||new Set(items).size!==items.length)throw new Error('G10_G02_GRANT_COLUMNS');return items as string[];};
  const changedNames=new Set([...names(oldColumns).filter(name=>!names(nextColumns).includes(name)),...names(nextColumns).filter(name=>!names(oldColumns).includes(name))]);
  const selectedNames=new Set([priorDeclaration.columns.find(column=>canonical(column.field)===canonical(field))?.name,declaration.columns.find(column=>canonical(column.field)===canonical(field))?.name].filter((name):name is string=>typeof name==='string'));
  if([...changedNames].some(name=>!selectedNames.has(name)))throw new Error('G10_G02_UNRELATED_GRANT_COLUMN');
  const grantEffect=(row:Subject,bundle:TableDeploymentBundle,role:'grant-add'|'grant-revoke',order:number):EffectNode=>{
   const meaning=row.meaning as any;if(meaning.table!==table||meaning.privilege!=='update'||meaning.grantOption!==false||typeof meaning.role!=='string'||!Array.isArray(meaning.columns)||meaning.columns.length===0||meaning.columns.some((name:unknown)=>typeof name!=='string'))throw new Error('G10_G02_GRANT_MEANING');
   const sourcePath=meaning.sourcePath;if(typeof sourcePath!=='string'||!sourcePath.endsWith('/policy/person/update'))throw new Error('G10_G02_GRANT_PATH');
   const boundRow=sourceBoundPersonUpdateGrant(bundle,table,sourcePath,meaning,row.identity),rendered=renderG02GrantEffect({role,sourcePath,row:boundRow}),identitySubject=row.identity.subject as Json[],subject:EffectNode['subject']={kind:'dependency',table,dependencyKind:'grant',id:JSON.stringify(identitySubject),sourcePath,meaningDigest:hashCanonical(row.meaning)},action=role==='grant-add'?'add' as const:'remove' as const;
   return {id:`g02-${bindingKey}-${role}`,kind:'grant',operation:role==='grant-add'?'dependency-add':'dependency-drop',subject,sourcePath,sql:rendered.sql,transaction:'required',recovery:'rollback-transaction',sourceOrder:order,atomicGroup:group,transition:{action,collection:'grants',meaning:action==='add'?{catalogMeaning:clone(row.meaning),validation:null,validity:null}:{}}};
  };
  const revoke=grantEffect(oldGrant[0]!,previous,'grant-revoke',sourceOrder),add=grantEffect(newGrant[0]!,next,'grant-add',sourceOrder+records.length+1);effects.unshift(revoke);effects.push(add);
  effectSubjects.unshift(revoke.subject);effectSubjects.push(add.subject);
  const revokeIdentity=hashCanonical(inventoryCatalogIdentity(revoke.subject)),addIdentity=hashCanonical(inventoryCatalogIdentity(add.subject));
  const grantColumnIdentities=(row:Subject,declaration:{columns:{name:string;field:TableRef}[]}):string[]=>{
   const meaning=row.meaning as any,names=meaning.columns as string[],identities:string[]=[];
   for(const name of names){const column=declaration.columns.find(item=>item.name===name);if(!column)throw new Error('G10_G02_GRANT_COLUMN_UNBOUND:'+name);identities.push(hashCanonical(inventoryCatalogIdentity({kind:'field',table,field:column.field})));}
   return identities;
  };
  const fieldIdentity=hashCanonical(inventoryCatalogIdentity(subject));
  // Keep the direct edge to the full selected Field group even when adding a
  // newly granted Field is the only catalog-column prerequisite in the new
  // grant (or the selected Field is absent from one side's grant columns).
  edges.push({dependent:fieldIdentity,prerequisite:revokeIdentity,sourcePath:revoke.sourcePath,reason:'g02-grant-revoke-before-field',state:'present'});
  edges.push({dependent:addIdentity,prerequisite:fieldIdentity,sourcePath:add.sourcePath,reason:'g02-grant-add-after-field-group',state:'present'});
  for(const columnIdentity of grantColumnIdentities(oldGrant[0]!,priorDeclaration))edges.push({dependent:columnIdentity,prerequisite:revokeIdentity,sourcePath:revoke.sourcePath,reason:'g02-grant-revoke-before-field',state:'present'});
  for(const columnIdentity of grantColumnIdentities(newGrant[0]!,declaration))edges.push({dependent:addIdentity,prerequisite:columnIdentity,sourcePath:add.sourcePath,reason:'g02-grant-add-after-field-group',state:'present'});
 }
 return {effects,edges};
}
