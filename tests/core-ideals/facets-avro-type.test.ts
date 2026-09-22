import {test,expect} from 'bun:test';
import {inspectAvroFacetType} from '../../src/adapters/avro/facet-type';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
import fixture from '../../fixtures/avro/facet-discovery-cases.json';
const inspect=(s:string)=>inspectAvroFacetType(parseNativeJson(s));

test('Avro declaration facts never claim codec enforcement or input exactness',()=>{
 for(const [type,bits] of [['int',32],['long',64]] as const){
  const r=inspect(JSON.stringify(type));expect(r.meaning).toEqual({family:'integer',bits,signed:true});
  expect(r.basis).toBe('isolated-native-declaration');expect(r.enforcement).toBe('unverified');
 }
 for(const [type,bits] of [['float',32],['double',64]] as const)expect(inspect(JSON.stringify(type)).meaning).toEqual({family:'float',bits});
 expect(inspect('"string"').meaning).toEqual({family:'string'});
 expect(inspect('"bytes"').meaning).toEqual({family:'binary',exactBytes:null});
});
test('fixed exact size includes zero without relabeling a nonzero exact size as a maximum',()=>{
 for(const size of [0,1,4097,9007199254740991]){
  const r=inspect(`{"type":"fixed","name":"n.B","size":${size},"aliases":["Old"],"doc":"original"}`);
  expect(r.meaning).toEqual({family:'binary',exactBytes:size});
  expect(r.unclaimedPaths).toEqual(['/aliases','/doc','/name']);
 }
 for(const size of ['-1','-0','0.0','2e0','9007199254740993','true','null','"2"'])
  expect(inspect(`{"type":"fixed","name":"B","size":${size}}`).state).toBe('unsupported');
 for(const name of ['', 'x\n','a..b','1bad'])expect(inspect(JSON.stringify({type:'fixed',name,size:1})).state).toBe('unsupported');
});
test('decimal coefficient domains require exact pairs and bounded signed carrier capacity',()=>{
 const bare=inspect('{"type":"bytes","logicalType":"decimal","precision":3}');
 expect(bare.meaning).toEqual({family:'decimal',precision:3,scale:0,carrier:'bytes',exactBytes:null});
 for(const [size,precision] of [[1,2],[2,4],[4,9],[16,38]]){
  const text=(p:number)=>JSON.stringify({type:'fixed',name:'D',size,logicalType:'decimal',precision:p,scale:0});
  expect(inspect(text(precision!)).state).toBe('declared');expect(inspect(text(precision!+1)).state).toBe('unsupported');
 }
 for(const [precision,scale] of [['0','0'],['3','4'],['3','-1'],['3','null'],['3','false'],['3','2.0'],['3.0','2'],['9007199254740993','0']])
  expect(inspect(`{"type":"bytes","logicalType":"decimal","precision":${precision},"scale":${scale}}`).state).toBe('unsupported');
 for(const size of [0,4097,9007199254740991])expect(inspect(JSON.stringify({type:'fixed',name:'D',size,logicalType:'decimal',precision:1})).state).toBe('unsupported');
 expect(inspect('{"type":"fixed","name":"D","size":4096,"logicalType":"decimal","precision":9863}').state).toBe('declared');
 expect(inspect('{"type":"fixed","name":"D","size":4096,"logicalType":"decimal","precision":9864}').state).toBe('unsupported');
});
test('unknown and invalid logical meaning stays native instead of becoming a physical scalar facet',()=>{
 for(const schema of [{type:'long',logicalType:'timestamp-micros'},{type:'bytes',logicalType:'future',precision:3},{type:'int',logicalType:'decimal',precision:3},{type:'string',logicalType:null}]){
  const text=JSON.stringify(schema),r=inspect(text);expect(r.state).toBe('unsupported');expect(r.meaning).toBeUndefined();expect(renderTree(r.native)).toBe(text);
 }
 for(const schema of ['"Customer"','"boolean"','"null"','["null","int"]','{"type":"array","items":"int"}','{"type":"map","values":"int"}'])expect(inspect(schema).state).toBe('unsupported');
});
test('custom constraints and exact tokens remain unclaimed and copied',()=>{
 const text='{"type":"int","width":8,"unsigned":true,"a/b~c":{"n":9007199254740993}}',source=parseNativeJson(text);
 const r=inspectAvroFacetType(source);expect(r.meaning).toEqual({family:'integer',bits:32,signed:true});
 expect(r.unclaimedPaths).toEqual(['/a~1b~0c','/unsigned','/width']);expect(renderTree(r.native)).toBe(text);
 if(r.native.kind==='object')delete r.native.members.width;
 expect(renderTree(source)).toBe(text);
});
test('malformed or future tagged representation refuses interpretation and does not execute getters',()=>{
 let getterCalls=0;const bad={get kind(){getterCalls++;return 'string';},value:'int'};
 expect(()=>inspectAvroFacetType(bad as never)).toThrow();expect(getterCalls).toBe(0);
 for(const node of [{kind:'string',value:7},{kind:'string',value:'int',future:true},{kind:'object',members:{type:{kind:'string',value:'int'},future:{kind:'number',value:'2',newMeaning:true}}}])expect(inspectAvroFacetType(node as never).state).toBe('unsupported');
 const malformed=parseNativeJson('{"type":"fixed","name":"B","size":2}');
 if(malformed.kind==='object')malformed.members.size={kind:'number',value:'2\n'};
 expect(inspectAvroFacetType(malformed).state).toBe('unsupported');
});
test('every native discovery schema remains available with explicit declaration or refusal',()=>{
 for(const row of fixture.cases){
  const text=JSON.stringify(row.schema),r=inspect(text);
  expect(renderTree(r.native)).toBe(text);expect(r.enforcement).toBe('unverified');
  expect(r.state==='declared'?!!r.meaning:!!r.reason).toBe(true);
 }
});
