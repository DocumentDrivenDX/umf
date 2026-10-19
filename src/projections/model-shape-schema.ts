// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '../model/types';
import type {ModelShape} from '../extensions/binding/model-shape';
/** Recursive exact-token schemas; portable codecs own logical refinements. */
export function shapeAvro(node:ModelShape,namespace:string):Json{
 let type:Json;
 if(node.kind==='array')type={type:'array',items:shapeAvro(node.item,namespace+'_item')};
 else if(node.kind==='map')type={type:'map',values:shapeAvro(node.item,namespace+'_value')};
 else if(node.kind==='group')type={type:'record',name:namespace,namespace:'umf.composition',fields:node.members.map((m,i)=>({name:'m'+i,type:shapeAvro(m,namespace+'_m'+i)}))};
 else if(node.carrier.kind==='words64')type={type:'record',name:namespace,namespace:'umf.composition',fields:[node.carrier.highColumn,node.carrier.lowColumn].map(name=>({name,type:'long'}))};
 else if(node.carrier.kind==='native-uuid'||node.carrier.kind==='bytes16')type={type:'fixed',name:namespace,namespace:'umf.composition',size:16,...(node.carrier.kind==='native-uuid'?{logicalType:'uuid'}:{})};
 else type=node.carrier.kind==='uuid-text'?{type:'string',logicalType:'uuid'}:'string';
 return node.field.nullability==='required'?type:['null',type];
}
export function shapeParquet(node:ModelShape,name:string):Json{
 const common={name,nullable:node.field.nullability!=='required'};
 if(node.kind==='array')return {...common,physicalType:'GROUP',logicalType:'LIST',item:shapeParquet(node.item,'element')};
 if(node.kind==='map')return {...common,physicalType:'GROUP',logicalType:'MAP',value:shapeParquet(node.item,'value')};
 if(node.kind==='group')return {...common,children:node.members.map((m,i)=>shapeParquet(m,'m'+i))};
 if(node.carrier.kind==='words64')return {...common,children:[node.carrier.highColumn,node.carrier.lowColumn].map(name=>({name,nullable:false,physicalType:'INT64',logicalType:'INTEGER',bitWidth:64,isSigned:node.carrier.kind==='words64'&&node.carrier.signed}))};
 if(node.carrier.kind==='native-uuid'||node.carrier.kind==='bytes16')return {...common,physicalType:'FIXED_LEN_BYTE_ARRAY',length:16,logicalType:node.carrier.kind==='native-uuid'?'UUID':null};
 return {...common,physicalType:'BYTE_ARRAY',logicalType:'STRING'};
}
