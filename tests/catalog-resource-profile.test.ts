import {test,expect} from 'bun:test';
import {copyJson,withCatalogResourceProfile,LIMITS} from '../src/model/json';
import {readJsonValue} from '../src/model/serialization';
test('catalog opt-in retains the ordinary profile and restores it on success and failure',()=>{
 const data=Array.from({length:100_001},()=>null);const text=JSON.stringify(data);
 expect(()=>copyJson(data)).toThrow(/structural limit/);
 expect(withCatalogResourceProfile(()=>copyJson(data))).toEqual(data);
 expect(withCatalogResourceProfile(()=>readJsonValue(text,'json'))).toEqual(data);
 expect(()=>copyJson(data)).toThrow(/structural limit/);
 expect(()=>withCatalogResourceProfile(()=>{throw Error('abort')})).toThrow('abort');
 expect(()=>copyJson(data)).toThrow(/structural limit/);
 expect(LIMITS.maxValues).toBe(100_000);
});
test('catalog profile remains finite and preserves original parser refusal semantics',()=>{
 expect(()=>withCatalogResourceProfile(()=>copyJson(Array.from({length:1_000_000},()=>null)))).toThrow(/structural limit/);
 for(const text of ['{"a":1,"a":2}','{"a":9007199254740993}','{"a":-0}','{"a":0.10000000000000001}'])
  expect(()=>withCatalogResourceProfile(()=>readJsonValue(text,'json'))).toThrow();
 expect(()=>withCatalogResourceProfile(()=>readJsonValue('a: &x [1]\nb: *x','yaml'))).toThrow();
 expect(()=>withCatalogResourceProfile(()=>readJsonValue('['.repeat(130)+'0'+']'.repeat(130),'json'))).toThrow();
 expect(()=>withCatalogResourceProfile(()=>readJsonValue(' '.repeat(4_000_001),'json'))).toThrow();
});
