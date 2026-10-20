// SPDX-License-Identifier: MIT OR Apache-2.0
import {tableOperationSource} from './table-operation-fixture';
export function temporalSource(){
 const source=tableOperationSource() as any,module=source.modules[0],payload=module.extensions['umf.tables'];
 const fields=[['day','date',{kind:'date'}],['at','timestamp',{kind:'timestamptz'}],['amount','decimal',{kind:'numeric',precision:10,scale:2}]] as const;
 for(const [id,scalarType,nativeType] of fields){
  const field={module:'demo',element:id};
  module.elements.push({id,kind:'field',scalarType,cardinality:'one',nullability:'required',extensions:{},...(id==='amount'?{facets:{precision:10,scale:2}}:{})});
  module.elements.find((e:any)=>e.id==='Note').members.push(field);
  payload.tables[0].columns.push({field,name:id,nativeType});
  for(const op of payload.commands){
   if(op.body.kind==='read'){if(op.body.result!=='count')op.body.fields.push(field);}
   else if(op.body.kind!=='delete'){
    op.parameters.push({id,field});op.body.values.push({field,value:{kind:'parameter',parameter:id}});op.body.returning.push(field);
   }
  }
 }
 payload.tables[0].columns.find((c:any)=>c.name==='at').default={kind:'currentTimestamp'};
 const clock=structuredClone(payload.commands.find((c:any)=>c.id==='create'));
 clock.id='create_clock';clock.parameters=clock.parameters.filter((p:any)=>p.id!=='at');clock.body.values=clock.body.values.filter((v:any)=>v.field.element!=='at');
 payload.commands.push(clock);
 for(const [id,field,op] of [['read_before','at','lt'],['read_on_day','day','eq']]){
  const command=structuredClone(payload.commands[0]);
  command.id=id;command.parameters=[{id:field,field:{module:'demo',element:field}}];
  command.body.where={op,field:{module:'demo',element:field},value:{kind:'parameter',parameter:field}};
  command.body.maxRows=100;
  payload.commands.push(command);
 }
 return source;
}
if(import.meta.main)await Bun.write(process.argv[2]!,JSON.stringify(temporalSource()));
