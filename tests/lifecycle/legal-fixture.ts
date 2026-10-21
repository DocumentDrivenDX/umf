// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit native projection of retained fabricated legal domain sources. */
import clients from '../../spec/domain-packs/legal/umf/clients.json';
import matters from '../../spec/domain-packs/legal/umf/matters.json';
import timekeepers from '../../spec/domain-packs/legal/umf/timekeepers.json';
import teams from '../../spec/domain-packs/legal/umf/matter_teams.json';
import {normalizeRowScope} from '../../src/table-authoring/row-scope';
import {inspectTableLifecycle} from '../../src/extensions/tables';
import {compileTableDeployment} from '../../src/table-deployment';
export const originals=[clients,timekeepers,matters,teams];
export const moduleId='legal_lifecycle';
const ref=(element:string)=>({module:moduleId,element});
export const options={version:'umf.table-migration-options/0.1' as const,backfills:[] as any[],concurrentIndexes:[] as {table:string;index:string}[]};
const allow={kind:'allow'},deny={kind:'deny'};
const rules=(rule:any)=>Object.fromEntries(['select','insert','update','delete'].map(command=>[command,structuredClone(rule)]));
export function legalSource(alice='legal_alice',bob='legal_bob'){
 const elements:any[]=[],tables:any[]=[];
 for(const source of originals){
  const id=source.table_name,columns=source.columns.map(column=>{
   const native:any=column.data_type==='INTEGER'?{kind:'int4'}:column.data_type==='DATE'?{kind:'date'}:column.data_type==='DECIMAL'?{kind:'numeric',precision:(column as any).precision,scale:(column as any).scale}:{kind:'text'};
   const scalarType=column.data_type==='INTEGER'?'integer':column.data_type==='DATE'?'date':column.data_type==='DECIMAL'?'decimal':'string';
   const field=id+'__'+column.name;
   elements.push({id:field,name:field,description:column.description,kind:'field',scalarType,cardinality:'one',nullability:column.nullable?'absent-allowed':'required',...(scalarType==='decimal'?{facets:{precision:native.precision,scale:native.scale}}:{}),extensions:{}});
   return {field:ref(field),name:column.name,nativeType:native};
  });
  const keys=[{id:'primary',name:'primary',primary:true,fields:source.primary_key.map(name=>ref(id+'__'+name))}];
  for(const [i,fields]of ((source as any).unique_constraints??[]).entries())keys.push({id:'unique_'+i,name:'unique_'+i,primary:false,fields:fields.map((name:string)=>ref(id+'__'+name))});
  elements.push({id,name:id,description:source.description,kind:'record',members:columns.map(column=>column.field),keys,extensions:{}});
  tables.push({id,record:ref(id),name:id,columns,indexes:[],checks:[],foreignKeys:((source as any).relationships?.foreign_keys??[]).map((fk:any,i:number)=>({id:'fk_'+i,name:id+'_fk_'+i,fields:[ref(id+'__'+fk.column)],target:{record:ref(fk.references_table),key:'primary'},onUpdate:'noAction',onDelete:'restrict',deferrable:false})),policy:{mode:'native-rls',person:rules(deny),batch:{...rules(deny),select:allow}}});
 }
 const table=(id:string)=>tables.find(t=>t.id===id)!;
 const role=ref('matter_teams__database_role');
 elements.push({id:role.element,description:'Synthetic database role assigned by the host; never a plugin-supplied identity claim.',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 elements.find(e=>e.id==='matter_teams').members.push(role);
 table('matter_teams').columns.push({field:role,name:'database_role',nativeType:{kind:'text'}});
 table('matter_teams').policy.person.select={kind:'owner',field:role};
 const member={kind:'related',record:ref('matter_teams'),matches:[{source:ref('matters__matter_id'),target:ref('matter_teams__matter_id')}],rule:{kind:'owner',field:role}};
 table('matters').policy.person=rules(member);
 table('matters').policy.batch.insert=allow;
 table('clients').policy.person.select=allow; // Explicitly reviewed public synthetic reference metadata.
 table('timekeepers').policy.person.select={kind:'memberOfRole',role:'billing_admin'};
 // Delay one original FK to qualify adding integrity constraints to existing rows.
 table('matters').foreignKeys=[];
 const seed=(id:string,values:Record<string,unknown>)=>({table:id,values:Object.entries(values).map(([name,value])=>({field:ref(id+'__'+name),value:value===null?null:typeof value==='number'?{integerToken:String(value)}:name==='billing_rate'?{decimalToken:String(value)}:name.endsWith('_date')?{date:value}:{string:value}}))});
 const rows=[seed('clients',{client_id:1,client_name:'Fabricated client'}),
  seed('timekeepers',{timekeeper_id:1,timekeeper_name:'Synthetic A',timekeeper_level:'associate',billing_rate:'125.00'}),
  seed('timekeepers',{timekeeper_id:2,timekeeper_name:'Synthetic B',timekeeper_level:'partner',billing_rate:'250.00'}),
  ...[1,2].map(id=>seed('matters',{matter_id:id,client_id:1,matter_number:'DEMO-'+id,matter_title:"Synthetic client's matter",practice_area:'demonstration',open_date:'2026-01-01',close_date:null,jurisdiction:'synthetic',court:'demonstration'})),
  seed('matter_teams',{matter_team_id:1,matter_id:1,timekeeper_id:1,database_role:alice}),
  seed('matter_teams',{matter_team_id:2,matter_id:2,timekeeper_id:2,database_role:bob})];
 const commands:any[]=tables.map(t=>({version:'umf.table-operation/0.1',id:'read_'+t.id,parameters:[],consistency:'statement',replay:'none',body:{kind:'read',table:t.id,fields:t.columns.map((c:any)=>c.field),where:{op:'all'},orderBy:[{field:elements.find(e=>e.id===t.id).keys[0].fields[0],direction:'asc'}],result:'page',maxRows:100,cursorKey:'primary'}}));
 commands.push({version:'umf.table-operation/0.1',id:'rename_matter',parameters:[{id:'id',field:ref('matters__matter_id')},{id:'title',field:ref('matters__matter_title')}],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'matters',where:{op:'eq',field:ref('matters__matter_id'),value:{kind:'parameter',parameter:'id'}},values:[{field:ref('matters__matter_title'),value:{kind:'parameter',parameter:'title'}}],returning:[],maxRows:1}});
 const document={umf:'0.10.0',id:'legal-lifecycle-demo',vocabularies:{'umf.tables':{version:'0.1.0'}},modules:[{id:moduleId,namespace:'legal_lifecycle',elements,extensions:{'umf.tables':{profile:'postgresql18/0.1',tables,seedSets:[{id:'synthetic-bootstrap',conflict:'error',rows}],commands}}}]};
 const deploymentConfiguration={module:moduleId,schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}};
 const normalize=(tableId:string,rowScope:any,bindings:any={})=>{
  const table=tables.find(t=>t.id===tableId)!;
  const result=normalizeRowScope({row_scope:rowScope},{record:table.record,ownerColumns:bindings.ownerColumns??{},via:bindings.via??[],groups:bindings.groups??{},openReferenceRead:bindings.openReferenceRead,
   admitPolicy(policy){const candidate=structuredClone(document);candidate.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id===tableId).policy=policy;const checked=inspectTableLifecycle(candidate);if(!checked.valid||!checked.complete)return checked.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message}));const compiled=compileTableDeployment({text:JSON.stringify(candidate),configuration:deploymentConfiguration});return compiled.status==='blocked'?compiled.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message})):[];}});
  if(!result.valid||!result.policy)throw Error('Legal row_scope normalization failed: '+JSON.stringify(result.diagnostics));table.policy=result.policy;
 };
 normalize('matters',{commands:['select','insert','update','delete'],via:[{table:'matter_teams',person_column:'database_role',key_column:'matter_id'}],batch:['select','insert']},{via:[{name:'matter_teams',record:ref('matter_teams'),personColumnName:'database_role',keyColumnName:'matter_id',sourceField:ref('matters__matter_id'),keyField:ref('matter_teams__matter_id'),personField:role}]});
 normalize('clients',{commands:['select'],batch:[],open_reference_read:true},{openReferenceRead:true});
 normalize('timekeepers',{commands:['select'],batch:[],groups:[{name:'billing_admin',commands:['select']}]},{groups:{billing_admin:'billing_admin'}});
 return document;
}
export function evolvedLegalSource(source=legalSource()){
 const d=structuredClone(source),m=d.modules[0]!,p=m.extensions['umf.tables'],t=p.tables.find((t:any)=>t.id==='matters')!;
 const column=ref('matters__review_state');
 m.elements.push({id:column.element,description:'Administrative review state; backfilled explicitly before NOT NULL.',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',allowedValues:[{string:'restricted'},{string:'reviewed'}],extensions:{}} as any);
 m.elements.find((e:any)=>e.id==='matters')!.members!.push(column);
 t.columns.push({field:column,name:'review_state',nativeType:{kind:'text'},default:{kind:'literal',value:{string:'restricted'}}});
 t.checks.push({id:'positive_id',name:'matters_positive_id',expression:{op:'gt',left:{op:'field',field:ref('matters__matter_id')},right:{op:'literal',value:{integerToken:'0'}}}});
 t.foreignKeys.push({id:'fk_0',name:'matters_fk_0',fields:[ref('matters__client_id')],target:{record:ref('clients'),key:'primary'},onUpdate:'noAction',onDelete:'restrict',deferrable:false});
 p.commands.push({version:'umf.table-operation/0.1',id:'backfill_review',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'matters',where:{op:'isNull',field:column},values:[{field:column,value:{kind:'literal',value:{string:'restricted'}}}],returning:[],maxRows:100}});
 return {source:d,options:{...structuredClone(options),backfills:[{table:'matters',column,operation:'backfill_review',scopedRows:true as const}]}};
}
export function indexedLegalSource(source=evolvedLegalSource().source){
 const d=structuredClone(source),t=d.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 t.indexes.push({id:'client_lookup',name:'matters_client_lookup',fields:[ref('matters__client_id')],unique:false,include:[]},{id:'unique_title',name:'matters_unique_title',fields:[ref('matters__matter_title')],unique:true,include:[]});
 return {source:d,options:{...structuredClone(options),concurrentIndexes:[{table:'matters',index:'client_lookup'},{table:'matters',index:'unique_title'}]}};
}
