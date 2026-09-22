import {test,expect} from 'bun:test';
import {inspectAvroFacetSelection} from '../../src/core-ideals/avro-facet-selection';
import {inspectAvroTypeShape} from '../../src/core-ideals/avro-cardinality-type';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
import fixture from '../../fixtures/avro/facet-selection-cases.json';
const roots=(row:typeof fixture.cases[number])=>[...(row.dependencies??[]).map(d=>({root:parseNativeJson(d.schema),dependencyId:d.id})),{root:parseNativeJson(row.schema)}];

test('facet selection retains named declarations, branch order, containers and null context',()=>{
 for(const row of fixture.cases){
  const source=roots(row),before=JSON.stringify(source);
  if(!row.selectionResolves){expect(()=>inspectAvroFacetSelection(source,row.location)).toThrow();continue;}
  const result=inspectAvroFacetSelection(source,row.location);
  expect<string>(result.shape).toBe(row.shape!);expect(result.allowsNull).toBe(row.allowsNull!);
  expect<(string|null)[]>(result.branches.map(b=>b.inspection.meaning?.family??null)).toEqual(row.families!);
  expect(result.basis).toBe('structural-selection-not-enforcement');expect(JSON.stringify(source)).toBe(before);
 }
});
test('reference use and dependency definition retain distinct identities and unknown tokens',()=>{
 const row=fixture.cases.find(r=>r.id==='named-decimal-union')!,source=roots(row);
 const result=inspectAvroFacetSelection(source,row.location),branch=result.branches[1]!;
 expect(renderTree(branch.branch.native)).toBe('"Money"');
 expect(branch.branch.location).toEqual({path:'/fields/0/type/1'});
 expect(branch.declaration.location).toEqual({path:'',dependencyId:'money'});
 expect(renderTree(branch.declaration.native)).toContain('9007199254740993');
 expect(branch.inspection.meaning).toEqual({family:'decimal',precision:4,scale:2,carrier:'fixed',exactBytes:2});
 const dependency=inspectAvroFacetSelection(source,{path:'',dependencyId:'money'});
 expect(dependency.branches[0]!.inspection.meaning).toEqual(branch.inspection.meaning);
 if(branch.declaration.native.kind==='object')delete branch.declaration.native.members.future;
 expect(renderTree(source[0]!.root)).toContain('9007199254740993');
 expect(renderTree(source[1]!.root)).toContain('"default":null');
});
test('union widths remain distinct; array/map items are never promoted onto containers',()=>{
 const row=fixture.cases.find(r=>r.id==='integer-union')!,result=inspectAvroFacetSelection(roots(row),row.location);
 expect(result.branches.map(b=>b.inspection.meaning)).toEqual([{family:'integer',bits:32,signed:true},{family:'integer',bits:64,signed:true}]);
 const array=fixture.cases.find(r=>r.id==='array-container')!,selected=inspectAvroFacetSelection(roots(array),array.location);
 expect(selected.branches[0]!.inspection.state).toBe('unsupported');
 expect(selected.branches[0]!.branch.item?.location).toEqual({path:'/items'});
});
test('facet zero-size profile does not widen previously qualified Cardinality resolution',()=>{
 const source=[{root:parseNativeJson('{"type":"fixed","name":"Empty","size":0}')}];
 expect(inspectAvroFacetSelection(source,{path:''}).branches[0]!.inspection.meaning).toEqual({family:'binary',exactBytes:0});
 expect(()=>inspectAvroTypeShape(source,{path:''})).toThrow();
 for(const token of ['2.0','2e0','9007199254740993'])expect(()=>inspectAvroFacetSelection([{root:parseNativeJson(`{"type":"fixed","name":"F","size":${token}}`)}],{path:''})).toThrow();
});
test('selection cannot interpret defaults, metadata, missing dependencies or duplicate names as types',()=>{
 const source=[{root:parseNativeJson('{"type":"record","name":"R","fields":[{"name":"v","type":"string","default":"int","custom":{"type":"long"}}]}')}];
 for(const path of ['/fields/0/default','/fields/0/custom','/fields/0/custom/type','/missing'])expect(()=>inspectAvroFacetSelection(source,{path})).toThrow();
 expect(()=>inspectAvroFacetSelection(source,{path:'',dependencyId:'missing'})).toThrow();
 const dependency={dependencyId:'d',root:parseNativeJson('{"type":"fixed","name":"F","size":1}')};
 expect(()=>inspectAvroFacetSelection([dependency,dependency,...source],{path:''})).toThrow();
 expect(()=>inspectAvroFacetSelection([{...dependency,dependencyId:'a'},{...dependency,dependencyId:'b'},...source],{path:''})).toThrow();
 let calls=0;expect(()=>inspectAvroFacetSelection([{get root(){calls++;return source[0]!.root;}}],{path:''})).toThrow();expect(calls).toBe(0);
});
