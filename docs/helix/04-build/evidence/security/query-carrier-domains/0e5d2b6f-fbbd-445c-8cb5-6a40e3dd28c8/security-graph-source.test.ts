import {test,expect} from 'bun:test';
import {createCandidateGraphSource,createCandidateGraphEndpointKeys,requireCandidateGraphSource} from '../packages/postgresql/src/security-graph-source';
const input=()=>({kind:'edge' as const,typeId:'2',propertyOwnerTypeId:'1',fields:[{propertyId:'1',column:'active',scalar:'boolean' as const}]});
test('opaque edges explicitly omit association record and property fields',()=>{
 const opaque={kind:'edge' as const,typeId:'2',propertyOwnerTypeId:null,fields:[]},source=createCandidateGraphSource(opaque);
 expect(source.validitySql).toContain('r.assoc_type_id IS NULL');expect(source.validitySql).toContain('NOT (TRUE)');expect(source.sql).not.toContain('g.props');
 expect(()=>createCandidateGraphSource({...opaque,kind:'object'})).toThrow();
 expect(()=>createCandidateGraphSource({...opaque,fields:input().fields})).toThrow();
 expect(()=>createCandidateGraphSource({...opaque,propertyOwnerTypeId:'1'})).toThrow();
});
test('source issuance survives caller mutation and refuses copied source',()=>{
 const original=input(),source=createCandidateGraphSource(original),sql=source.sql;
 original.fields[0]!.propertyId='99';original.typeId='99';
 expect(source.sql).toBe(sql);expect(Object.isFrozen(source)).toBe(true);
 expect(()=>requireCandidateGraphSource(source)).not.toThrow();expect(()=>requireCandidateGraphSource({...source})).toThrow();
});
test('metadata accessors never execute',()=>{
 let reads=0;const original=input();Object.defineProperty(original.fields[0],'scalar',{enumerable:true,get(){reads++;return 'boolean';}});
 expect(()=>createCandidateGraphSource(original)).toThrow();expect(reads).toBe(0);
});
test('custom collection iterators never execute',()=>{
 let reads=0;const original=input();Object.defineProperty(original.fields,Symbol.iterator,{value:function*(){reads++;yield original.fields[0];}});
 expect(()=>createCandidateGraphSource(original)).toThrow();expect(reads).toBe(0);
});
test('native metadata identifiers retain exact domain limits',()=>{
 for(const value of ['2147483648','-2147483649','01','+1','1;SELECT 1'])expect(()=>createCandidateGraphSource({...input(),typeId:value})).toThrow();
 expect(()=>createCandidateGraphSource({...input(),typeId:'-2147483648'})).not.toThrow();
 expect(()=>createCandidateGraphSource({...input(),typeId:'2147483647'})).not.toThrow();
});
test('unsupported domains, conflicting aliases and hidden metadata refuse',()=>{
 for(const patch of [{scalar:'integer'},{column:'source_id'},{extra:true}]){
  const original=input();Object.assign(original.fields[0]!,patch);expect(()=>createCandidateGraphSource(original)).toThrow();
 }
 expect(()=>createCandidateGraphSource({...input(),kind:'object'})).toThrow();
 const duplicate=input();duplicate.fields.push({...duplicate.fields[0]!});expect(()=>createCandidateGraphSource(duplicate)).toThrow();
});
test('sparse or excessive candidate fields refuse',()=>{
 const sparse=input();sparse.fields.length=2;expect(()=>createCandidateGraphSource(sparse)).toThrow();
 const huge=input();huge.fields=Array.from({length:257},(_,i)=>({propertyId:String(i),column:'c'+i,scalar:'boolean' as const}));expect(()=>createCandidateGraphSource(huge)).toThrow();
});

test('array proxy cannot grow captured length or invoke a length getter',()=>{
 const original=input(),expected=createCandidateGraphSource(original);let reads=0;
 original.fields=new Proxy(original.fields,{get(target,key,receiver){if(key==='length')return ++reads<=3?1:257;return Reflect.get(target,key,receiver);},getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&/^[0-9]+$/.test(key))return {configurable:true,enumerable:true,writable:true,value:{propertyId:String(BigInt(key)+1n),column:key==='0'?'active':'field_'+key,scalar:'boolean'}};return Reflect.getOwnPropertyDescriptor(target,key);}});
 const actual=createCandidateGraphSource(original);expect(reads).toBe(0);expect(actual).toEqual(expected);
});

test('endpoint keys refuse unissued sources and malformed exact namespace metadata',()=>{
 const source=createCandidateGraphSource(input()),key={typeId:'2',keyNumber:'1',namespaceHex:'00'};
 const packet={source,sourceKey:key,targetKey:key};
 expect(()=>createCandidateGraphEndpointKeys({...packet,source:{...source}})).toThrow();
 expect(()=>createCandidateGraphEndpointKeys({...packet,source:createCandidateGraphSource({...input(),kind:'object',typeId:'1'})})).toThrow();
 for(const patch of [{keyNumber:'32768'},{namespaceHex:'0'},{namespaceHex:'GG'},{namespaceHex:''},{extra:true}])expect(()=>createCandidateGraphEndpointKeys({...packet,sourceKey:{...key,...patch}})).toThrow();
});
test('endpoint validity checks original typed object existence and live record metadata',()=>{
 const source=createCandidateGraphSource(input()),key={typeId:'2',keyNumber:'1',namespaceHex:'00'},projected=createCandidateGraphEndpointKeys({source,sourceKey:key,targetKey:{...key,typeId:'3'}});
 for(const role of ['source','target']){
  expect(projected.validitySql).toContain('endpoint_object.id OPERATOR(pg_catalog.=) q.'+role+'_id::pg_catalog.int8');
  expect(projected.validitySql).toContain('endpoint_object.type_id OPERATOR(pg_catalog.=) q.'+role+'_type::pg_catalog.int4');
 }
 expect(projected.validitySql).toContain('NOT endpoint_type.provisional AND endpoint_type.retired_rev IS NULL');
 expect(projected.validitySql).toContain("endpoint_type.kind OPERATOR(pg_catalog.=) 'record'::pg_catalog.text");
});
test('endpoint key metadata is captured without accessor execution',()=>{
 let reads=0;const key={typeId:'2',keyNumber:'1',namespaceHex:'00'};
 Object.defineProperty(key,'namespaceHex',{enumerable:true,get(){reads++;return '00';}});
 expect(()=>createCandidateGraphEndpointKeys({source:createCandidateGraphSource(input()),sourceKey:key,targetKey:key})).toThrow();
 expect(reads).toBe(0);
});
