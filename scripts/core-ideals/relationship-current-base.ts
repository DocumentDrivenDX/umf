// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../src/model/types';
import type {Document} from '../../src';

/** Independently authored current base for the retained relationship shape proposals. */
export function relationshipCurrentBase():Document{
 const definitions=[
  {id:'Order',fields:['id']},
  {id:'Line',fields:['id','quantity']},
  {id:'Invoice',fields:['id']},
  {id:'Customer',fields:['id','accountNumber'],alternate:'account'},
  {id:'Product',fields:['id']},
  {id:'Employee',fields:['id']},
  {id:'Student',fields:['id']},
  {id:'Course',fields:['id']},
  {id:'Enrollment',fields:['id','grade']},
 ];
 const elements:any[]=[];
 for(const record of definitions){
  const members=record.fields.map(field=>({module:'sales',element:`${record.id}.${field}`}));
  const keys:any[]=[{id:'pk',name:`${record.id} primary`,primary:true,fields:[members[0]]}];
  if(record.alternate)keys.push({id:record.alternate,name:`${record.id} ${record.alternate}`,fields:[members.find(x=>x.element.endsWith('.accountNumber'))]});
  elements.push({id:record.id,name:record.id,kind:'record',members,keys,extensions:{}});
 }
 for(const record of definitions)for(const field of record.fields){
  const id=`${record.id}.${field}`;
  elements.push({id,kind:'field',scalarType:field==='accountNumber'||field==='grade'?'string':'integer',nullability:'required',cardinality:'one',extensions:{}});
 }
 return {umf:CURRENT_CORE_VERSION,id:'relationship-authored-shapes-current',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements}]} as unknown as Document;
}
