// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as u from '../src/index';
import {uuidDocument,uuidBinding,FIELD,UUID} from './helpers/uuid-fixtures';
test('explicit UUID carriers preserve bits; paired signed words retain exact native transport tokens',()=>{
 for(const kind of ['words64','uuid-text','native-uuid','bytes16'])for(const signed of [true,false]){
  const b=uuidBinding(kind,signed),d=uuidDocument();expect(u.inspectBinding(b,d).complete).toBe(true);
  const encoded=u.encodeBit128CarrierValue(b,d,FIELD,{uuid:UUID.toUpperCase()});
  expect(u.decodeBit128CarrierValue(b,d,FIELD,encoded)).toEqual({uuid:UUID});
  if(kind==='words64')expect(encoded.lo).toBe(signed?'-8603657889541918977':'9843086184167632639');
  for(const fmt of ['json','yaml'] as const)expect(u.readBindingDocument(u.writeBindingDocument(b,d,fmt),d,fmt)).toEqual(b);
  expect(()=>u.getBinding(b,d)).toThrow();
 }
});
test('partial pairs, collisions, unknown carrier, domain conflicts, nulls and stale logical bindings',()=>{
 const b=uuidBinding(),d=uuidDocument();const payload:any=b.extensions!['umf.binding'];
 expect(()=>u.decodeBit128CarrierValue(b,d,FIELD,{hi:null,lo:'0'})).toThrow();expect(()=>u.decodeBit128CarrierValue(b,d,FIELD,{hi:'0'})).toThrow();expect(()=>u.decodeBit128CarrierValue(b,d,FIELD,{hi:null,lo:null})).toThrow();
 d.modules[0]!.elements[1]!.nullability='absent-allowed';delete d.modules[0]!.elements[0]!.keys;
 expect(u.decodeBit128CarrierValue(b,d,FIELD,{hi:null,lo:null})).toBeNull();
 payload.fields[0].carrier.lowColumn='hi';expect(u.inspectBinding(b,d).valid).toBe(false);payload.fields[0].carrier.lowColumn='lo';
 payload.fields[0].carrier.future=true;expect(u.inspectBinding(b,d).complete).toBe(false);expect(()=>u.encodeBit128CarrierValue(b,d,FIELD,{uuid:UUID})).toThrow();delete payload.fields[0].carrier.future;
 payload.logical.documentId='stale';expect(u.inspectBinding(b,d).valid).toBe(false);
 expect(u.inspectBinding(uuidBinding('hex128-text'),uuidDocument()).valid).toBe(false);
});
test('dispatch rejects getters before reading profile and relevant unknown logical facets block codecs',()=>{
 const d=uuidDocument();let calls=0;
 const hostile:any={get vocabularies(){calls++;return {'umf.binding':{version:'0.3.0'}};}};
 expect(u.inspectBinding(hostile,d).valid).toBe(false);expect(calls).toBe(0);
 d.modules[0]!.elements[1]!.facets={unknownRule:1};expect(u.inspectBinding(uuidBinding(),d).complete).toBe(false);expect(()=>u.encodeBit128CarrierValue(uuidBinding(),d,FIELD,{uuid:UUID})).toThrow();
});
test('unqualified native index layouts remain serializable but cannot authorize generation or values',()=>{
 const b=uuidBinding(),d=uuidDocument();(b.extensions!['umf.binding'] as any).indexes=[{name:'identity',kind:'unique',on:[{field:FIELD}],unique:true}];
 const result=u.inspectBinding(b,d);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(result.diagnostics.map(d=>d.code)).toContain('BINDING_UNQUALIFIED_LAYOUT');
 expect(u.readBindingDocument(u.writeBindingDocument(b,d,'json'),d,'json')).toEqual(b);expect(()=>u.encodeBit128CarrierValue(b,d,FIELD,{uuid:UUID})).toThrow();
});
test('carrier validation and encoding use the same copied literal and binding snapshots',()=>{
 const doc=u.declareCoreSchemaProperties(uuidDocument(),{scope:'element',...FIELD},{allowedValues:[{uuid:UUID}]});let reads=0;
 const literal=new Proxy({uuid:UUID},{get(target,key,receiver){if(key==='uuid'){reads++;return '00000000-0000-0000-0000-000000000000';}return Reflect.get(target,key,receiver);}});
 const binding=new Proxy(uuidBinding(),{get(target,key,receiver){if(key==='extensions'){reads++;return {};}return Reflect.get(target,key,receiver);}});
 const slots=u.encodeBit128CarrierValue(binding,doc,FIELD,literal);expect(u.decodeBit128CarrierValue(uuidBinding(),doc,FIELD,slots)).toEqual({uuid:UUID});expect(reads).toBe(0);
});
