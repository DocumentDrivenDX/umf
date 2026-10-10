import assert from 'node:assert/strict';
import {expect,test} from 'bun:test';
import {copyJson} from '../../src/model/json';

test('sparse arrays cannot substitute a digit-only ordinary property for an indexed value',()=>{
  for(const key of ['4294967295','4294967296','999999999999999999999999999999999999']){
    const sparse:any[]=[];sparse.length=1;
    Object.defineProperty(sparse,key,{value:1,enumerable:true});
    expect(Object.keys(sparse)).toHaveLength(1);
    expect(()=>copyJson(sparse)).toThrow('Non-index array property');
    expect(sparse.length).toBe(1);
    expect(Object.hasOwn(sparse,'0')).toBe(false);
  }
});

test('dense ordered JSON arrays preserve null, exact token strings and unknown object keys',()=>{
  const values=[null,{future:'18446744073709551615'},false];
  expect(JSON.stringify(copyJson(values))).toBe(JSON.stringify(values));
  expect(copyJson([])).toEqual([]);
});

test('JSON conformance ignores builtin prototype choice but detects every represented-value mutation',()=>{
  const ordinary=JSON.parse('{"future":{"__proto__":{"retained":true},"number":2},"items":["a","b"]}');
  const copied=copyJson(ordinary);
  assert.deepEqual(copyJson(ordinary),copyJson(copied));
  const changes=[
    (v:any)=>{v.future.__proto__.retained=false;},
    (v:any)=>{delete v.future.number;},
    (v:any)=>{v.future.number=null;},
    (v:any)=>{v.items.reverse();},
    (v:any)=>{v.future.number='2';},
  ];
  for(const change of changes){
    const altered=copyJson(ordinary);change(altered);
    expect(()=>assert.deepEqual(copyJson(altered),copyJson(ordinary))).toThrow();
  }
});
