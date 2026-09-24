import {test,expect} from 'bun:test';
import {encodeCoreKeyTuple,verifyCoreKeyTuple,readCoreKeyTupleBytes} from '../../src/model/key-tuple';
import {tupleCases,tupleDocument,tupleIdentity} from '../../scripts/core-key-tuple-cases';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';

test('key tuple vectors and domain boundaries produce exact frames or atomic refusals',()=>{
 for(const row of tupleCases()){
  const before=JSON.stringify({document:row.document,values:row.values});
  if(row.error)expect(()=>encodeCoreKeyTuple(row.document,tupleIdentity,row.values),row.id).toThrow();
  else{
   const receipt=encodeCoreKeyTuple(row.document,tupleIdentity,row.values);
   expect(receipt.bytesHex,row.id).toBe(row.hex);
   expect(Array.from(readCoreKeyTupleBytes(receipt,row.document),v=>v.toString(16).padStart(2,'0')).join('')).toBe(row.hex);
   for(const format of ['json','yaml'] as const){const recovered=readJsonValue(writeJsonValue(receipt,format),format);expect(verifyCoreKeyTuple(recovered as any,row.document)).toEqual(receipt);}
  }
  expect(JSON.stringify({document:row.document,values:row.values})).toBe(before);
 }
});
test('stable key ID survives name/list changes while retained receipts detect stale context',()=>{
 const d=tupleDocument([{id:'x',scalarType:'string'},{id:'y',scalarType:'integer'}]),r=d.modules[0].elements[0];
 r.keys=[{id:'stable-key',name:'a',fields:[r.members[0]]},{id:'alternate',name:'b',fields:[r.members[1]]}];
 const receipt=encodeCoreKeyTuple(d,tupleIdentity,[{string:'value'}]);r.keys.reverse();r.keys[1].name='renamed';
 expect(encodeCoreKeyTuple(d,tupleIdentity,[{string:'value'}]).bytesHex).toBe(receipt.bytesHex);
 expect(()=>verifyCoreKeyTuple(receipt,d)).toThrow('Current document differs');
 expect(()=>encodeCoreKeyTuple(d,{...tupleIdentity,key:'a'},[{string:'value'}])).toThrow('does not resolve');
 expect(()=>encodeCoreKeyTuple(d,{module:'m',element:'record'} as any,[{string:'value'}])).toThrow('identities');
});
test('tuple verification rejects forged and nonminimal frames and altered retained inputs',()=>{
 const d=tupleDocument([{id:'x',scalarType:'integer'}]),receipt=encodeCoreKeyTuple(d,tupleIdentity,[{integerToken:'7'}]);
 for(const bytesHex of ['554d464b318100020137','554d464b310102810037','554d464b3101020138',receipt.bytesHex+'00'])expect(()=>readCoreKeyTupleBytes({...receipt,bytesHex},d)).toThrow();
 const forged=copyJson(receipt) as any;forged.values[0].integerToken='8';expect(()=>verifyCoreKeyTuple(forged,d)).toThrow();
 expect(()=>encodeCoreKeyTuple(d,tupleIdentity,[])).toThrow('one value');
});
test('unknown relevant qualifiers block and unrelated native extension content survives',()=>{
 for(const where of ['key','reference','member','facet']){
  const d=tupleDocument([{id:'x',scalarType:'integer'}]),r=d.modules[0].elements[0];
  if(where==='key')r.keys[0].future=true;
  if(where==='reference')r.keys[0].fields[0].future=true;
  if(where==='member')r.members[0].future=true;
  if(where==='facet')d.modules[0].elements[1].facets={future:true};
  expect(()=>encodeCoreKeyTuple(d,tupleIdentity,[{integerToken:'1'}])).toThrow('Relevant qualifier');
 }
 const d=tupleDocument([{id:'x',scalarType:'integer'}]);
 expect(encodeCoreKeyTuple(d,tupleIdentity,[{integerToken:'1'}]).source).toEqual(copyJson(d));
});
test('shortest length/count framing and no getter evaluation',()=>{
 const d=tupleDocument([{id:'x',scalarType:'string'}]);
 expect(encodeCoreKeyTuple(d,tupleIdentity,[{string:'x'.repeat(128)}]).bytesHex.startsWith('554d464b3101048001')).toBe(true);
 const many=tupleDocument(Array.from({length:128},(_,i)=>({id:'f'+i,scalarType:'boolean'})));
 expect(encodeCoreKeyTuple(many,tupleIdentity,Array.from({length:128},()=>({boolean:false}))).bytesHex.startsWith('554d464b318001')).toBe(true);
 let calls=0;const bad={get string(){calls++;return 'x';}};
 expect(()=>encodeCoreKeyTuple(d,tupleIdentity,[bad])).toThrow();expect(calls).toBe(0);
});

test('resource bounds and a bad later component refuse the whole tuple',()=>{
 const pair=tupleDocument([{id:'a',scalarType:'string'},{id:'b',scalarType:'string'}]);
 expect(()=>encodeCoreKeyTuple(pair,tupleIdentity,[{string:'valid'},null as any])).toThrow();
 const text='x'.repeat(2000001);
 expect(()=>encodeCoreKeyTuple(pair,tupleIdentity,[{string:text},{string:text}])).toThrow('Aggregate key value text');
 const single=tupleDocument([{id:'x',scalarType:'string'}]);
 expect(()=>encodeCoreKeyTuple(single,tupleIdentity,[{string:'\u0800'.repeat(1333334)}])).toThrow('UTF-8 payload');
});
