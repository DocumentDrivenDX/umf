import assert from 'node:assert/strict';

const base='fixtures/projections/ddd-authored-relationships/';
const graph=await Bun.file(base+'base.json').json();
const binding=structuredClone(graph.postgresqlBinding);
binding.id='ddd-keyed-postgresql-relationship-binding';
const order=binding.extensions['umf.binding'].elements.find((row:any)=>row.module==='sales'&&row.element==='Order');
assert(order?.partition==='tenant');
order.partition=null; // An id-only authored Key cannot be unique on a tenant-partitioned table.
const tablePolicy=structuredClone(graph.postgresqlPolicy);
tablePolicy.partitionFamilies=[];
const ref=(element:string)=>({module:'sales',element});
const field=(element:string,name:string)=>({...ref(element),field:name});
const key=(element:string)=>({...ref(element),key:'pk'});
const keyComponent=(element:string)=>({keyField:ref('field_'+element+'_id'),boundField:field(element,'id'),column:'id',sqlType:'bigint',nullable:false});
const keyLayouts=[
 {record:ref('Order'),key:'pk',table:'sales.orders',constraint:'pk_orders',components:[keyComponent('Order')]},
 {record:ref('Customer'),key:'pk',table:'sales.customers',constraint:'pk_customers',components:[keyComponent('Customer')]},
 {record:ref('Product'),key:'pk',table:'sales.products',constraint:'pk_products',components:[keyComponent('Product')]},
 {record:ref('OrderProduct'),key:'pk',table:'sales.order_products',constraint:'pk_order_products',components:[keyComponent('OrderProduct')]},
];
const component=(endpoint:string,carrier:string,carrierField:string)=>({
 keyField:ref('field_'+endpoint+'_id'),endpointField:field(endpoint,'id'),endpointColumn:'id',
 carrierField:field(carrier,carrierField),carrierColumn:carrierField,sqlType:'bigint',nullable:false,
});
const physicalRelationshipChoices=[
 {module:'sales',id:'order-customer',storage:'foreign_key'},
 {module:'sales',id:'order-product',storage:'junction'},
];
const relationshipLayouts=[
 {relationship:{module:'sales',id:'order-customer'},storage:'foreign_key',carrierTable:'sales.orders',targetKey:key('Customer'),targetConstraint:'fk_orders_customer',targetComponents:[component('Customer','Order','customerId')]},
 {relationship:{module:'sales',id:'order-product'},storage:'junction',carrierTable:'sales.order_products',associationRecord:ref('OrderProduct'),associationKey:key('OrderProduct'),sourceKey:key('Order'),targetKey:key('Product'),sourceConstraint:'fk_order_products_order',targetConstraint:'fk_order_products_product',sourceComponents:[component('Order','OrderProduct','orderId')],targetComponents:[component('Product','OrderProduct','productId')]},
];
const policy={profile:'postgresql-relationship-layout-1',targetVersion:'17.4',keyLayouts,relationshipLayouts};
for(const proposal of graph.relationshipProposals){
 const choice=physicalRelationshipChoices.find((row:any)=>row.module===proposal.module&&row.id===proposal.assertion.id);
 const layout=relationshipLayouts.find((row:any)=>row.relationship.module===proposal.module&&row.relationship.id===proposal.assertion.id);
 assert(choice&&layout&&choice.storage===layout.storage);
 const target=proposal.assertion.target[0];assert(target&&layout.targetKey.element===target.element&&layout.targetKey.key===target.key);
}
await Bun.write(base+'postgresql-layout-proposal.json',JSON.stringify({
 scope:'Prepublication layout policy proposal; exact Key/DDD/column maps require future validator and native DDL proof',
 logicalDocumentId:graph.logical.id,logicalCoreVersion:graph.logical.umf,
 binding,tablePolicy,physicalRelationshipChoices,policy,
},null,2)+'\n');
console.log({keys:keyLayouts.length,relationships:relationshipLayouts.length,partition:order.partition});
