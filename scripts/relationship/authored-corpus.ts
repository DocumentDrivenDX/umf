import assert from 'node:assert/strict';

const moduleId='sales';
const ref=(element:string)=>({module:moduleId,element});
const fields:{record:string;name:string;type:'integer'|'string'}[]=[];
const records:{id:string;name:string;kind:'record';members:{module:string;element:string}[];keys:{id:string;name:string;primary?:boolean;fields:{module:string;element:string}[]}[];extensions:{}}[]=[];
function record(id:string,keyName:string,extras:{name:string;type:'integer'|'string'}[]=[],alternate?:{name:string;field:string}){
 const names:{name:string;type:'integer'|'string'}[]=[{name:keyName,type:keyName==='id'?'integer':'string'},...extras];
 for(const field of names)fields.push({record:id,...field});
 records.push({id,name:id,kind:'record',members:names.map(field=>ref(id+'.'+field.name)),keys:[
  {id:'pk',name:id+' primary',primary:true,fields:[ref(id+'.'+keyName)]},
  ...(alternate?[{id:alternate.name,name:id+' '+alternate.name,fields:[ref(id+'.'+alternate.field)]}]:[]),
 ],extensions:{}});
}
record('Order','id');
record('Line','id',[{name:'quantity',type:'integer'}]);
record('Invoice','id');
record('Customer','id',[{name:'accountNumber',type:'string'}],{name:'account',field:'accountNumber'});
record('Product','id');
record('Employee','id');
record('Student','id');
record('Course','id');
record('Enrollment','id',[{name:'grade',type:'string'}]);
const base={umf:'0.6.0',id:'relationship-authored-shapes',vocabularies:{},modules:[{id:moduleId,namespace:'sales',elements:[
 ...records,...fields.map(field=>({id:field.record+'.'+field.name,kind:'field',scalarType:field.type,nullability:'required',cardinality:'one',extensions:{}})),
]}]};
const multiplicity=(min:number,max:number|'*')=>({min,max});
const target=(element:string,key='pk')=>({...ref(element),key});
const cases=[
 {id:'one-to-one',relationship:{id:'order-invoice',name:'invoice',source:[ref('Order')],target:[target('Invoice')],sourceMultiplicity:multiplicity(1,1),targetMultiplicity:multiplicity(0,1),targetLifecycle:'independent',directed:true,inverse:'order'}},
 {id:'owned-one-to-many',relationship:{id:'order-lines',name:'lines',source:[ref('Order')],target:[target('Line')],sourceMultiplicity:multiplicity(1,1),targetMultiplicity:multiplicity(1,'*'),targetLifecycle:'owned',directed:true,inverse:'order'}},
 {id:'many-to-one-alternate-key',relationship:{id:'order-customer',name:'customer',source:[ref('Order')],target:[target('Customer','account')],sourceMultiplicity:multiplicity(0,'*'),targetMultiplicity:multiplicity(1,1),targetLifecycle:'independent',directed:true,inverse:'orders'}},
 {id:'many-to-many',relationship:{id:'order-product',name:'products',source:[ref('Order')],target:[target('Product')],sourceMultiplicity:multiplicity(0,'*'),targetMultiplicity:multiplicity(0,'*'),targetLifecycle:'independent',directed:true}},
 {id:'heterogeneous-source',relationship:{id:'sales-customer',name:'customerForSalesDocument',source:[ref('Order'),ref('Invoice')],target:[target('Customer','account')],sourceMultiplicity:multiplicity(0,'*'),targetMultiplicity:multiplicity(1,1),targetLifecycle:'independent',directed:true}},
 {id:'self-referential',relationship:{id:'employee-manager',name:'manager',source:[ref('Employee')],target:[target('Employee')],sourceMultiplicity:multiplicity(0,'*'),targetMultiplicity:multiplicity(0,1),targetLifecycle:'independent',directed:true,inverse:'reports'}},
 {id:'undirected',relationship:{id:'student-course',name:'studies',source:[ref('Student')],target:[target('Course')],sourceMultiplicity:multiplicity(0,'*'),targetMultiplicity:multiplicity(0,'*'),targetLifecycle:'unspecified',directed:false}},
 {id:'reified-association',relationship:{id:'student-course-enrollment',name:'enrollsIn',source:[ref('Student')],target:[target('Course')],sourceMultiplicity:multiplicity(0,'*'),targetMultiplicity:multiplicity(0,'*'),targetLifecycle:'independent',associationRecord:ref('Enrollment'),directed:true,inverse:'students'}},
];
const ids=new Set<string>(),names=new Set<string>();
for(const item of cases){
 assert(!ids.has(item.relationship.id)&&!names.has(item.relationship.name));
 ids.add(item.relationship.id);names.add(item.relationship.name);
 for(const endpoint of item.relationship.source)assert(records.some(record=>record.id===endpoint.element));
 for(const endpoint of item.relationship.target)assert(records.some(record=>record.id===endpoint.element&&record.keys.some(key=>key.id===endpoint.key)));
 const association=item.relationship.associationRecord;
 if(association)assert(records.some(record=>record.id===association.element));
}
await Bun.write('fixtures/relationship/authored/corpus.json',JSON.stringify({scope:'Preparatory CONTRACT-041 cases; base is Key 0.6.0 and relationship proposals are separate until admission',base,cases},null,2)+'\n');
console.log({records:records.length,fields:fields.length,cases:cases.length});
