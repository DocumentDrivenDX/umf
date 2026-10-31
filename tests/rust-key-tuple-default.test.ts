import {expect,test} from 'bun:test';
import {bindCoreKeyTupleDefault} from '../src/access/rust-key-tuple-default';
import {UmfError} from '../src/model/errors';
import type {CoreKeyIdentity,CoreKeyTupleReceipt,CoreKeyTupleValue,PreparedCoreKeyTuples} from '../src/model/key-tuple';

const identity:CoreKeyIdentity={module:'m',element:'r',key:'k'};
const values:CoreKeyTupleValue[]=[{string:'x'}];
const receipt={operation:'encode-core-key-tuple',version:'4.0.0',profile:'umf-key-tuple-v1',source:{},identity,values,keyPath:'/keys/0',bytesHex:'00'} as CoreKeyTupleReceipt;
const source={extensions:{unknown:{preserved:true}}};
function nativeFailure(){const error=new Error('native');Object.assign(error,{name:'UmfCoreError',code:'KEY_TUPLE_RECEIPT',path:'/receipt'});return error;}

test('default key tuple facade maps branded Rust errors and keeps four-key prepared shape',()=>{
 const native=nativeFailure();
 const prepared:PreparedCoreKeyTuples={profile:'umf.core.key-tuples.prepared/1',source,
  encode(){throw native;},verify(){throw native;}};
 const engine={readCoreKeyTupleBytes(){throw native;},prepareCoreKeyTuples(){return prepared;}};
 const api=bindCoreKeyTupleDefault(engine,error=>error===native);
 for(const operation of [()=>api.readCoreKeyTupleBytes(receipt,source),()=>api.prepareCoreKeyTuples(source).encode(identity,values),()=>api.prepareCoreKeyTuples(source).verify(receipt)]) {
  try{operation();throw new Error('expected native failure');}catch(error){expect(error).toBeInstanceOf(UmfError);expect(error).not.toBe(native);expect(error).toMatchObject({name:'UmfError',code:'KEY_TUPLE_RECEIPT',path:'/receipt',message:'native'});}
 }
 const prepareFailure=bindCoreKeyTupleDefault({readCoreKeyTupleBytes(){return new Uint8Array();},prepareCoreKeyTuples(){throw native;}},error=>error===native);
 expect(()=>prepareFailure.prepareCoreKeyTuples(source)).toThrow(UmfError);
 const clean:PreparedCoreKeyTuples={profile:'umf.core.key-tuples.prepared/1',source,encode:()=>receipt,verify:value=>value};
 const result=bindCoreKeyTupleDefault({readCoreKeyTupleBytes:()=>new Uint8Array([0x55]),prepareCoreKeyTuples:()=>clean},()=>false).prepareCoreKeyTuples(source);
 expect(Object.keys(result)).toEqual(['profile','source','encode','verify']);expect(Object.isFrozen(result)).toBe(true);expect(result.source).toBe(source);expect(result.encode(identity,values)).toBe(receipt);expect(result.verify(receipt)).toBe(receipt);
});

test('default key tuple facade preserves host error identity when the error is not branded native',()=>{
 const hostFailure=new TypeError('caller host failure');
 const thrown=(operation:()=>unknown)=>{try{operation();}catch(error){return error;}throw new Error('expected host failure');};
 const prepared:PreparedCoreKeyTuples={profile:'umf.core.key-tuples.prepared/1',source,encode(){throw hostFailure;},verify(){throw hostFailure;}};
 const api=bindCoreKeyTupleDefault({readCoreKeyTupleBytes(){throw hostFailure;},prepareCoreKeyTuples(){throw hostFailure;}},()=>false);
 expect(thrown(()=>api.readCoreKeyTupleBytes(receipt,source))).toBe(hostFailure);
 expect(thrown(()=>api.prepareCoreKeyTuples(source))).toBe(hostFailure);
 const preparedApi=bindCoreKeyTupleDefault({readCoreKeyTupleBytes(){return new Uint8Array();},prepareCoreKeyTuples(){return prepared;}},()=>false).prepareCoreKeyTuples(source);
 expect(thrown(()=>preparedApi.encode(identity,values))).toBe(hostFailure);
 expect(thrown(()=>preparedApi.verify(receipt))).toBe(hostFailure);
});
