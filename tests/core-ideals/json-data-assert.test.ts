import {importAvroSchema,getAvroNode,readDocument,writeDocument,copyJson} from '../../src';
import {parseNativeJson} from '../../src/model/native-json';
import {test,expect} from 'bun:test';
import {assertJsonDataEqual,assertNativeRepresentationEqual} from '../../scripts/core-ideals/json-data-assert';
test('qualification compares complete JSON meaning across portable object prototypes',()=>{
 const ordinary=JSON.parse('{"__proto__":{"keep":true},"future":[null,"retained"]}'),portable=Object.assign(Object.create(null),ordinary);
 expect(()=>assertJsonDataEqual(ordinary,portable)).not.toThrow();
 expect(()=>assertJsonDataEqual(ordinary,{...portable,future:['retained',null]})).toThrow();
 expect(()=>assertJsonDataEqual(ordinary,{...portable,future:[null,'lost']})).toThrow();
});
test('qualification equality does not normalize hostile or non-JSON meaning',()=>{
 let calls=0;const hostile=Object.defineProperty({},'future',{enumerable:true,get(){calls++;return 1}});
 expect(()=>assertJsonDataEqual(hostile,{})).toThrow();expect(calls).toBe(0);
 expect(()=>assertJsonDataEqual(Object.create({native:'hidden'}),{})).toThrow();expect(()=>assertJsonDataEqual({value:undefined},{})).toThrow();
});

test('native binary recovery compares every byte without entering the JSON envelope',()=>{
 expect(()=>assertNativeRepresentationEqual(Buffer.from([0,128,255]),new Uint8Array([0,128,255]))).not.toThrow();
 expect(()=>assertNativeRepresentationEqual(new Uint8Array([0,128,255]),new Uint8Array([0,128,254]))).toThrow();
 expect(()=>assertJsonDataEqual(new Uint8Array([1]),[1])).toThrow();
});

test('actual Avro JSON/YAML tree recovery preserves exact unknown native number tokens',()=>{
 const schema='{"type":"fixed","name":"Bytes","size":4,"future":9007199254740993}',source=importAvroSchema(schema,{id:'native-tree'}),expected=parseNativeJson(schema);
 for(const format of ['json','yaml'] as const){const actual=getAvroNode(readDocument(writeDocument(source,format),format),'');expect(()=>assertJsonDataEqual(actual,expected)).not.toThrow();}
 const altered=copyJson(expected) as any;altered.members.future.value='9007199254740992';expect(()=>assertJsonDataEqual(altered,expected)).toThrow();
});
