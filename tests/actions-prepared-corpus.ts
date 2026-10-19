// SPDX-License-Identifier: MIT OR Apache-2.0
import {uuidDocument,UUID,KEY} from './helpers/uuid-fixtures';
import fixture from '../fixtures/actions/approve.json';
import {tupleCases,tupleIdentity} from '../scripts/core-key-tuple-cases';
import type * as owner from '../src/index';
type Api=Pick<typeof owner,'encodeCoreKeyTuple'|'verifyCoreKeyTuple'|'prepareCoreKeyTuples'|'admitActionInputs'|'selectActionIdentity'|'prepareActionIdentities'>;
const result=(call:()=>unknown)=>{try{return {value:JSON.parse(JSON.stringify(call()))};}catch(error:any){return {code:error.code??String(error),path:error.path};}};
const equal=(a:unknown,b:unknown,id:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Prepared/stateless mismatch: '+id);};
/** Shared corpus for the actual public ESM in Bun and Chromium. */
export function runPreparedCorpus(api:Api){
 const rows:{id:string;passed:true}[]=[];
 const original=tupleCases().find(row=>!row.error)!.document,prepared=api.prepareCoreKeyTuples(original);
 for(const [name,document,values,profile] of [
  ['string-v1',uuidDocument('string'),[{string:'foreign'}],'umf-key-tuple-v1'],
  ['string-v2',uuidDocument('string'),[{string:'foreign'}],'umf-key-tuple-v2'],
  ['uuid-v2',uuidDocument(),[{uuid:UUID}],'umf-key-tuple-v2'],
 ] as const){
  const receipt=api.encodeCoreKeyTuple(document,KEY,[...values],{profile});
  equal(result(()=>prepared.verify(receipt)),result(()=>api.verifyCoreKeyTuple(receipt,original)),name+'-foreign-source');
  rows.push({id:'foreign/'+name,passed:true});
 }

 for(const row of tupleCases()){
  equal(result(()=>api.prepareCoreKeyTuples(row.document).encode(tupleIdentity,row.values)),result(()=>api.encodeCoreKeyTuple(row.document,tupleIdentity,row.values)),row.id);
  if(!row.error){const scope=api.prepareCoreKeyTuples(row.document),receipt=scope.encode(tupleIdentity,row.values);equal(result(()=>scope.verify(receipt)),result(()=>api.verifyCoreKeyTuple(receipt,row.document)),row.id+'-verify');}
  rows.push({id:'key/'+row.id,passed:true});
 }
 for(const mode of ['entity','input','literal']){
  const document=structuredClone(fixture) as unknown as owner.Document,action=(document.modules[0]!.extensions!['umf.actions'] as any).actions[0] as owner.Action,frame=action.writes[0]!;
  if(mode==='input'){action.parameters.push({id:'id',kind:'value',field:{module:'sales',element:'id'},required:true});frame.selector.expression='{"key":"pk","components":[{"input":"id"}]}';frame.selector.references=[{parameter:'id'}];}
  if(mode==='literal'){frame.selector.expression='{"key":"pk","components":[{"literal":{"string":"fixed"}}]}';frame.selector.references=[];}
  const scope=api.prepareActionIdentities(document,action),valid={order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'bar'}]},...(mode==='input'?{id:{string:'bar'}}:{})};
  for(const [index,inputs] of [valid,{}, {...valid,unknown:{string:'x'}},{...valid,order:null},{...valid,order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'\ud800'}]}}].entries()){
   equal(result(()=>scope.admitInputs(inputs as any)),result(()=>api.admitActionInputs(document,action,inputs as any)),mode+'-admit-'+index);
   equal(result(()=>scope.select(frame.id,inputs as any)),result(()=>api.selectActionIdentity(document,action,frame,inputs as any)),mode+'-select-'+index);
   rows.push({id:'action/'+mode+'/'+index,passed:true});
  }
  const before=scope.select(frame.id,valid);document.modules[0]!.elements[0]!.scalarType='integer';frame.selector.expression='invalid';
  equal(result(()=>scope.select(frame.id,valid)),{value:JSON.parse(JSON.stringify(before))},mode+'-isolated');
  if(!Object.isFrozen(scope.source.modules[0]!.elements)||!Object.isFrozen(scope.action.writes[0]!.selector))throw Error('Unfrozen admitted source');
  let calls=0;const hostile=Object.defineProperty({},'order',{enumerable:true,get(){calls++;return valid.order;}});result(()=>scope.admitInputs(hostile));if(calls)throw Error('Input accessor invoked');
  rows.push({id:'action/'+mode+'/mutation-isolation',passed:true});
 }
 return rows;
}
