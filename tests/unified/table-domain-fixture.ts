// SPDX-License-Identifier: MIT OR Apache-2.0
import {temporalSource} from './table-temporal-fixture';
export function domainSource(){
 const source=temporalSource(),module=source.modules[0],payload=module.extensions['umf.tables'];
 const ref=(element:string)=>({module:'demo',element});
 const fields=[
  {id:'status',scalarType:'string',facets:{length:{min:1,max:12,unit:'unicode-scalar'}},allowedValues:[{string:'draft'},{string:'ready'}],nativeType:{kind:'varchar',length:12}},
  {id:'rank',scalarType:'integer',facets:{integerWidth:{bits:8,signed:false},range:{min:{integerToken:'1'},max:{integerToken:'10'},maxInclusive:false}},allowedValues:[{integerToken:'1'},{integerToken:'2'},{integerToken:'9'}],nativeType:{kind:'int4'}},
  {id:'tag',scalarType:'string',facets:{length:{min:1,max:3,unit:'unicode-scalar'}},nativeType:{kind:'text'}},
  {id:'active',scalarType:'boolean',allowedValues:[{boolean:true}],nativeType:{kind:'boolean'}},
 ];
 for(const {nativeType,...field} of fields){
  module.elements.push({...field,kind:'field',cardinality:'one',nullability:'required',extensions:{}});
  module.elements.find((e:any)=>e.id==='Note').members.push(ref(field.id));
  payload.tables[0].columns.push({field:ref(field.id),name:field.id,nativeType});
  for(const op of payload.commands){
   if(op.body.kind==='read'){if(op.body.result!=='count')op.body.fields.push(ref(field.id));}
   else if(op.body.kind!=='delete'){
    op.parameters.push({id:field.id,field:ref(field.id)});op.body.values.push({field:ref(field.id),value:{kind:'parameter',parameter:field.id}});op.body.returning.push(ref(field.id));
   }
  }
 }
 const amount=module.elements.find((e:any)=>e.id==='amount');
 amount.facets.range={min:{decimalToken:'0e999999999999'},max:{decimalToken:'100.00'},maxInclusive:false};
 amount.allowedValues=[{decimalToken:'0.00'},{decimalToken:'12.30'},{decimalToken:'99.99'}];
 const clock=structuredClone(payload.commands.find((c:any)=>c.id==='rename'));
 clock.id='touch';clock.parameters=clock.parameters.filter((p:any)=>p.id!=='at');
 clock.body.values=clock.body.values.filter((v:any)=>v.field.element!=='at');
 clock.body.values.push({field:ref('at'),value:{kind:'currentTimestamp'}});
 payload.commands.push(clock);
 return source;
}
if(import.meta.main)await Bun.write(process.argv[2]!,JSON.stringify(domainSource()));
