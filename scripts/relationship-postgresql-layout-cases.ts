import {migrateBindingRelationships,type Document,type PostgresqlRelationshipLayoutPolicy} from '../src';
import graph from '../fixtures/projections/ddd-authored-relationships/base.json';
import proposal from '../fixtures/projections/ddd-authored-relationships/postgresql-layout-proposal.json';
export function postgresqlLayoutCase():{logical:Document;binding:Document;policy:PostgresqlRelationshipLayoutPolicy}{
 const logical=structuredClone(graph.logical) as unknown as Document;logical.umf='0.7.0';
 for(const p of graph.relationshipProposals){const module=logical.modules.find(m=>m.id===p.module)!;(module.relationships??=[] as any[]);(module.relationships as any[]).push(structuredClone(p.assertion));}
 const old=structuredClone(proposal.binding) as unknown as Document,p=old.extensions!['umf.binding'] as any;p.logical.coreVersion='0.7.0';p.target.version='17.4';
 p.relationships=proposal.physicalRelationshipChoices.map(c=>({module:c.module,name:graph.relationshipProposals.find(r=>r.module===c.module&&r.assertion.id===c.id)!.assertion.name,storage:c.storage}));
 const binding=migrateBindingRelationships(old,logical).document;
 const policy=structuredClone(proposal.policy) as any;
 policy.fieldLayouts=[];
 for(const bound of p.fields){
  if(bound.storage!=='column')continue;
  const owner=logical.modules.find(m=>m.id===bound.module)!.elements.find(e=>e.id===bound.element)!;
  const coreField={module:bound.module,element:'field_'+bound.element+'_'+bound.field};
  const field=logical.modules.find(m=>m.id===coreField.module)!.elements.find(e=>e.id===coreField.element)!;
  const sqlType=proposal.tablePolicy.fieldTypes.find(f=>f.module===bound.module&&f.element===bound.element&&f.field===bound.field)!.sqlType;
  policy.fieldLayouts.push({coreField,boundField:{module:bound.module,element:bound.element,field:bound.field},table:p.elements.find((e:any)=>e.module===bound.module&&e.element===bound.element).table,column:bound.column,sqlType,nullable:field.nullability==='absent-allowed',collation:field.scalarType==='string'?'C':null});
 }
 for(const k of policy.keyLayouts)for(const c of k.components)c.collation=null;
 for(const l of policy.relationshipLayouts)for(const c of [...(l.sourceComponents??[]),...l.targetComponents])c.collation=null;
 return {logical,binding,policy};
}
export function postgresqlLayoutCases(){
 const cases:{id:string;valid:boolean;logical:Document;binding:Document;policy:PostgresqlRelationshipLayoutPolicy}[]=[];
 const add=(id:string,mutate:(f:any)=>void=()=>{},valid=true)=>{const f=postgresqlLayoutCase();mutate(f);cases.push({id,valid,...f});};
 const payload=(f:any):any=>f.binding.extensions['umf.binding'];
 add('keyed-association-and-fk');
 add('renamed-relationship',f=>f.logical.modules[0].relationships[0].name='renamed');
 add('alternate-unique-target',f=>{const r=f.logical.modules[0].elements.find((e:any)=>e.id==='Customer');r.keys[0].id='alternate';delete r.keys[0].primary;f.logical.modules[0].relationships[0].target[0].key='alternate';f.policy.keyLayouts.find((k:any)=>k.record.element==='Customer').key='alternate';f.policy.relationshipLayouts[0].targetKey.key='alternate';});
 add('nullable-composite',f=>{
  const module=f.logical.modules[0],customer=module.elements.find((e:any)=>e.id==='Customer'),order=module.elements.find((e:any)=>e.id==='Order');
  customer.extensions['umf.ddd'].fields.code={type:{kind:'scalar',name:'integer'},cardinality:'one'};order.extensions['umf.ddd'].fields.customerCode={type:{kind:'scalar',name:'integer'},cardinality:'optional'};
  for(const [owner,name,nullable] of [[customer,'code',false],[order,'customerCode',true]] as const){const field={id:'field_'+owner.id+'_'+name,kind:'field',scalarType:'integer',cardinality:'one',nullability:nullable?'absent-allowed':'required',extensions:{}};module.elements.push(field);owner.members.push({module:'sales',element:field.id});const b={module:'sales',element:owner.id,field:name,storage:'column',column:name};payload(f).fields.push(b);f.policy.fieldLayouts.push({coreField:{module:'sales',element:field.id},boundField:{module:'sales',element:owner.id,field:name},table:owner.id==='Customer'?'sales.customers':'sales.orders',column:name,sqlType:'bigint',nullable,collation:null});}
  customer.keys.push({id:'composite',name:'Composite',fields:[{module:'sales',element:'field_Customer_id'},{module:'sales',element:'field_Customer_code'}]});
  const pk=f.policy.keyLayouts.find((k:any)=>k.record.element==='Customer');f.policy.keyLayouts.push({...structuredClone(pk),key:'composite',constraint:'uq_customers_composite',components:[...structuredClone(pk.components),{keyField:{module:'sales',element:'field_Customer_code'},boundField:{module:'sales',element:'Customer',field:'code'},column:'code',sqlType:'bigint',nullable:false,collation:null}]});
  const l=f.policy.relationshipLayouts[0];l.targetKey.key='composite';module.relationships[0].target[0].key='composite';l.targetComponents.push({keyField:{module:'sales',element:'field_Customer_code'},endpointField:{module:'sales',element:'Customer',field:'code'},endpointColumn:'code',carrierField:{module:'sales',element:'Order',field:'customerCode'},carrierColumn:'customerCode',sqlType:'bigint',nullable:true,collation:null});
 });
 add('anonymous-junction',f=>{const l=f.policy.relationshipLayouts[1];delete f.logical.modules[0].relationships[1].associationRecord;delete l.associationRecord;delete l.associationKey;l.carrierTable='sales.links';for(const c of [...l.sourceComponents,...l.targetComponents])delete c.carrierField;});
 add('edge',f=>{const l=f.policy.relationshipLayouts[1];delete f.logical.modules[0].relationships[1].associationRecord;delete l.associationRecord;delete l.associationKey;l.storage='edge';payload(f).relationships[1].storage='edge';l.carrierTable='sales.edges';for(const c of [...l.sourceComponents,...l.targetComponents])delete c.carrierField;l.discriminator={column:'relationship',value:'products',sqlType:'text',nullable:false,collation:'C'};});
 for(const [id,change] of Object.entries({
  'name-for-id':(f:any):any=>f.policy.relationshipLayouts[0].relationship.id='customer',
  'name-for-key':(f:any):any=>f.policy.relationshipLayouts[0].targetKey.key='Customer ID',
  'missing-layout':(f:any):any=>f.policy.relationshipLayouts.pop(),
  'extra-layout':(f:any):any=>f.policy.relationshipLayouts.push({...f.policy.relationshipLayouts[0],relationship:{module:'sales',id:'absent'}}),
  'missing-key-component':(f:any):any=>f.policy.keyLayouts[0].components=[],
  'extra-endpoint-component':(f:any):any=>f.policy.relationshipLayouts[0].targetComponents.push({...f.policy.relationshipLayouts[0].targetComponents[0]}),
  'wrong-endpoint-field':(f:any):any=>f.policy.relationshipLayouts[0].targetComponents[0].keyField.element='field_Product_id',
  'heterogeneous-fk':(f:any):any=>f.logical.modules[0].relationships[0].source.push({module:'sales',element:'Product'}),
  'association-attribute-loss':(f:any):any=>f.policy.fieldLayouts=f.policy.fieldLayouts.filter((c:any)=>c.coreField.element!=='field_OrderProduct_quantity'),
  'association-identity-loss':(f:any):any=>delete f.policy.relationshipLayouts[1].associationKey,
  'duplicate-constraint':(f:any):any=>f.policy.relationshipLayouts[0].targetConstraint='pk_orders',
  'duplicate-key-index':(f:any):any=>f.policy.keyLayouts[1].constraint='pk_orders',
  'stale-binding':(f:any):any=>payload(f).logical.documentId='stale',
  'unsafe-type':(f:any):any=>f.policy.fieldLayouts[0].sqlType='bigint); DROP TABLE x; --',
  'unsafe-identifier':(f:any):any=>f.policy.relationshipLayouts[0].targetConstraint='fk;drop',
  'wrong-carrier':(f:any):any=>f.policy.relationshipLayouts[0].carrierTable='sales.customers',
  'nullability-mismatch':(f:any):any=>f.policy.relationshipLayouts[0].targetComponents[0].nullable=true,
  'type-mismatch':(f:any):any=>f.policy.relationshipLayouts[0].targetComponents[0].sqlType='integer',
  'collation-mismatch':(f:any):any=>f.policy.relationshipLayouts[0].targetComponents[0].collation='C',
  'missing-source-key':(f:any):any=>delete f.policy.relationshipLayouts[1].sourceKey,
  'unknown-policy':(f:any):any=>f.policy.future={meaning:true},
  'unknown-binding':(f:any):any=>payload(f).future={meaning:true},
  'partitioned-key':(f:any):any=>payload(f).elements[0].partition='tenant',
 }))add(id,change,false);
 return cases;
}
if(import.meta.main)await Bun.write('fixtures/projections/postgresql-relationship-layout/cases.json',JSON.stringify({scope:'Policy validation fixtures derived explicitly from keyed authored graph; no generated DDL or native enforcement',cases:postgresqlLayoutCases()},null,2)+'\n');
