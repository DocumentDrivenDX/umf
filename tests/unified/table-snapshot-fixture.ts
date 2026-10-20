// SPDX-License-Identifier: MIT OR Apache-2.0
import {tableOperationSource} from './table-operation-fixture';
export function snapshotSource(){
 const source=tableOperationSource() as any,module=source.modules[0],payload=module.extensions['umf.tables'];
 const ref=(element:string)=>({module:'demo',element});
 for(const[id,scalarType]of [['sourceAmount','decimal'],['sourceMemo','string']] as const){
  module.elements.push({id,kind:'field',scalarType,cardinality:'one',nullability:'absent-allowed',extensions:{},...(scalarType==='decimal'?{facets:{precision:4,scale:3,range:{min:{decimalToken:'0'},max:{decimalToken:'1'}}}}:{})});
  module.elements.find((e:any)=>e.id==='Note').members.push(ref(id));
  payload.tables[0].columns.push({field:ref(id),name:id,nativeType:scalarType==='decimal'?{kind:'numeric',precision:4,scale:3}:{kind:'text'}});
 }
 const extra=[['snapshotId','string',false],['sourceId','string',false],['savedOwner','string',false],['actor','string',false],['observedAt','timestamp',false],['comment','string',true],['savedAmount','decimal',true],['savedMemo','string',true]] as const;
 for(const[id,scalarType,nullable]of extra)module.elements.push({id,kind:'field',scalarType,cardinality:'one',nullability:nullable?'absent-allowed':'required',extensions:{},...(scalarType==='decimal'?{facets:{precision:4,scale:3}}:{})});
 module.elements.push({id:'Snapshot',kind:'record',members:extra.map(([id])=>ref(id)),keys:[{id:'primary',name:'primary',primary:true,fields:[ref('snapshotId')]}],extensions:{}});
 const person={select:{kind:'owner',field:ref('actor')},insert:{kind:'owner',field:ref('actor')},update:{kind:'deny'},delete:{kind:'deny'}};
 const batch={select:{kind:'allow'},insert:{kind:'allow'},update:{kind:'deny'},delete:{kind:'deny'}};
 payload.tables.push({id:'snapshots',record:ref('Snapshot'),name:'snapshots',columns:extra.map(([id,scalar])=>({field:ref(id),name:id,nativeType:scalar==='decimal'?{kind:'numeric',precision:4,scale:3}:{kind:scalar==='timestamp'?'timestamptz':'text'}})),indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person,batch}});
 payload.commands.push({version:'umf.table-operation/0.1',id:'capture',parameters:[{id:'snapshot_id',field:ref('snapshotId')},{id:'source_id',field:ref('id')},{id:'comment',field:ref('comment')}],consistency:'transaction',replay:'caller-key-required',body:{kind:'insertFrom',table:'snapshots',source:{table:'notes',where:{op:'eq',field:ref('id'),value:{kind:'parameter',parameter:'source_id'}}},values:[
  {field:ref('snapshotId'),value:{kind:'parameter',parameter:'snapshot_id'}},
  {field:ref('sourceId'),value:{kind:'sourceField',field:ref('id')}},
  {field:ref('savedOwner'),value:{kind:'sourceField',field:ref('owner')}},
  {field:ref('actor'),value:{kind:'currentPrincipal'}},
  {field:ref('observedAt'),value:{kind:'currentTimestamp'}},
  {field:ref('comment'),value:{kind:'parameter',parameter:'comment'}},
  {field:ref('savedAmount'),value:{kind:'sourceField',field:ref('sourceAmount')}},
  {field:ref('savedMemo'),value:{kind:'sourceField',field:ref('sourceMemo')}},
 ],returning:extra.map(([id])=>ref(id)),maxRows:1}});
 const all=structuredClone(payload.commands.at(-1));all.id='capture_all';
 all.parameters=all.parameters.filter((p:any)=>p.id==='comment');all.body.source.where={op:'all'};
 all.body.values[0].value={kind:'sourceField',field:ref('id')};payload.commands.push(all);
 return source;
}
if(import.meta.main)await Bun.write(process.argv[2]!,JSON.stringify(snapshotSource()));
