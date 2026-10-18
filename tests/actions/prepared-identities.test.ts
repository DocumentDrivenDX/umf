import {uuidDocument,UUID,KEY} from '../helpers/uuid-fixtures';
import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import {tupleCases,tupleDocument,tupleIdentity} from '../../scripts/core-key-tuple-cases';
import {encodeCoreKeyTuple,verifyCoreKeyTuple,prepareCoreKeyTuples} from '../../src/model/key-tuple';
import {admitActionInputs,selectActionIdentity,prepareActionIdentities} from '../../src/extensions/actions/selector';
import type {Document} from '../../src/model/types';
import type {Action} from '../../src/extensions/actions/types';
const outcome=(call:()=>unknown)=>{try{return {value:JSON.parse(JSON.stringify(call()))};}catch(error:any){return {code:error.code,path:error.path};}};
const setup=()=>{const document=structuredClone(fixture) as unknown as Document;return {document,action:(document.modules[0]!.extensions!['umf.actions'] as any).actions[0] as Action};};
const inputs=()=>({order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}});

test('prepared keys agree with every existing exact key vector and refusal',()=>{
 for(const row of tupleCases()){
  const expected=outcome(()=>encodeCoreKeyTuple(row.document,tupleIdentity,row.values));
  const actual=outcome(()=>prepareCoreKeyTuples(row.document).encode(tupleIdentity,row.values));
  expect(actual,row.id).toEqual(expected);
  if('value'in expected){const scope=prepareCoreKeyTuples(row.document),receipt=scope.encode(tupleIdentity,row.values);expect(scope.verify(receipt),row.id).toEqual(verifyCoreKeyTuple(receipt,row.document));}
 }
});
test('prepared receipts retain forged, stale, invalid-source and unknown-member refusals',()=>{
 const document=tupleDocument([{id:'x',scalarType:'string'}]),scope=prepareCoreKeyTuples(document),receipt=scope.encode(tupleIdentity,[{string:'x'}]);
 const variants=[{...receipt,bytesHex:receipt.bytesHex+'00'},{...receipt,values:[{string:'y'}]},{...receipt,keyPath:'/wrong'}, {...receipt,future:true}];
 const stale=structuredClone(receipt);(stale.source as any).id='another';variants.push(stale);
 const invalid=structuredClone(receipt);(invalid.source as any).umf='0.5.0';variants.push(invalid);
 for(const value of variants)expect(outcome(()=>scope.verify(value))).toEqual(outcome(()=>verifyCoreKeyTuple(value,document)));
});
test('prepared source, returned receipts, identities and values have isolated lifetimes',()=>{
 const document=tupleDocument([{id:'x',scalarType:'string'}]),original=structuredClone(document),scope=prepareCoreKeyTuples(document),identity={...tupleIdentity},values=[{string:'x'}];
 const first=scope.encode(identity,values);document.modules[0].elements[1].scalarType='integer';identity.key='missing';values[0]!.string='changed';(first.source as any).id='mutated';first.values[0]={string:'forged'};
 expect(scope.encode(tupleIdentity,[{string:'x'}])).toEqual(encodeCoreKeyTuple(original,tupleIdentity,[{string:'x'}]));
 expect(Object.isFrozen(scope.source)).toBe(true);expect(Object.isFrozen((scope.source as any).modules[0].elements)).toBe(true);
 expect(()=>Object.defineProperty(scope.source,'id',{value:'forged'})).toThrow();
});
test('prepared action inputs and both selector forms agree with stateless APIs',()=>{
 for(const kind of ['entity','input','literal']){
  const {document,action}=setup(),frame=action.writes[0]!;
  if(kind==='input'){action.parameters.push({id:'id',kind:'value',field:{module:'sales',element:'id'},required:true});frame.selector.expression='{"key":"pk","components":[{"input":"id"}]}';frame.selector.references=[{parameter:'id'}];}
  if(kind==='literal'){frame.selector.expression='{"key":"pk","components":[{"literal":{"string":"fixed"}}]}';frame.selector.references=[];}
  const scope=prepareActionIdentities(document,action),valid={...inputs(),...(kind==='input'?{id:{string:'o1'}}:{})};
  for(const supplied of [valid,{}, {...valid,unknown:{string:'x'}},{...valid,order:null},{...valid,order:{key:{module:'sales',element:'order',key:'missing'},components:[{string:'o1'}]}},{...valid,order:{key:{module:'sales',element:'order',key:'pk'},components:[{integerToken:'1'}]}}]){
   expect(outcome(()=>scope.admitInputs(supplied as any)),kind).toEqual(outcome(()=>admitActionInputs(document,action,supplied as any)));
   expect(outcome(()=>scope.select(frame.id,supplied as any)),kind).toEqual(outcome(()=>selectActionIdentity(document,action,frame,supplied as any)));
  }
 }
});
test('prepared action cannot observe later declaration/input/output mutation or invoke accessors',()=>{
 const {document,action}=setup(),original=structuredClone(document),originalAction=structuredClone(action),scope=prepareActionIdentities(document,action),supplied=inputs();
 const selected=scope.select('order-write',supplied);action.writes[0]!.selector.expression='invalid';document.modules[0]!.elements[0]!.scalarType='integer';supplied.order.components[0]!.string='changed';selected.entity.components[0]={string:'forged'};
 expect(scope.select('order-write',inputs())).toEqual(selectActionIdentity(original,originalAction,originalAction.writes[0]!,inputs()));
 expect(Object.isFrozen(scope.source.modules[0]!.elements)).toBe(true);expect(Object.isFrozen(scope.action.writes[0]!.selector)).toBe(true);
 let calls=0;const hostile=Object.defineProperty({},'order',{enumerable:true,get(){calls++;return inputs().order;}});
 expect(outcome(()=>scope.admitInputs(hostile))).toEqual(outcome(()=>admitActionInputs(original,originalAction,hostile)));expect(calls).toBe(0);
 expect(()=>scope.select('undeclared',inputs())).toThrow();
});
test('reused declaration checks preserve optional absence, output checks and per-call facets',()=>{
 const {document,action}=setup();
 document.modules[0]!.elements.push({id:'bounded',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{},facets:{integerWidth:{bits:8,signed:true}}});
 action.parameters.push({id:'bounded',kind:'value',field:{module:'sales',element:'bounded'},required:false},{id:'unused',kind:'value',field:{module:'sales',element:'missing'},required:false});
 action.outputs.push({id:'out',kind:'value',field:{module:'sales',element:'bounded'},required:true});
 const scope=prepareActionIdentities(document,action);
 for(let repeat=0;repeat<2;repeat++){
  for(const supplied of [inputs(),{...inputs(),bounded:{integerToken:'127'}},{...inputs(),bounded:{integerToken:'128'}},{...inputs(),bounded:null},{...inputs(),unused:{string:'x'}}])
   expect(outcome(()=>scope.admitInputs(supplied as any))).toEqual(outcome(()=>admitActionInputs(document,action,supplied as any)));
  for(const supplied of [{out:{integerToken:'-128'}},{out:{integerToken:'-129'}},{}])
   expect(outcome(()=>scope.admitInputs(supplied,true))).toEqual(outcome(()=>admitActionInputs(document,action,supplied,true)));
 }
});

test('prepared current scopes preserve foreign-source refusals and exact codec-profile verification',()=>{
 const document=tupleDocument([{id:'x',scalarType:'string'}]),scope=prepareCoreKeyTuples(document);
 for(const profile of ['umf-key-tuple-v1','umf-key-tuple-v2'] as const){
  const foreign=encodeCoreKeyTuple(uuidDocument('string'),KEY,[{string:'foreign'}],{profile});
  expect(outcome(()=>scope.verify(foreign))).toEqual({code:'KEY_TUPLE_STALE',path:'/source'});
  expect(outcome(()=>scope.verify(foreign))).toEqual(outcome(()=>verifyCoreKeyTuple(foreign,document)));
 }
 const foreign=encodeCoreKeyTuple(uuidDocument(),KEY,[{uuid:UUID}],{profile:'umf-key-tuple-v2'});
 expect(outcome(()=>scope.verify(foreign))).toEqual(outcome(()=>verifyCoreKeyTuple(foreign,document)));
 const currentUuid=uuidDocument(),sameSourceScope=prepareCoreKeyTuples(currentUuid);
 expect(outcome(()=>sameSourceScope.verify(foreign))).toEqual(outcome(()=>verifyCoreKeyTuple(foreign,currentUuid)));
 expect(()=>prepareCoreKeyTuples({...currentUuid,umf:'0.9.0'})).toThrow();
});
