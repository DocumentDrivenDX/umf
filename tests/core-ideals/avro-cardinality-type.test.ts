import {expect,test} from 'bun:test';
import {inspectAvroFieldShape,inspectAvroTypeShape} from '../../src/core-ideals/avro-cardinality-type';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
import fixture from '../../fixtures/avro/cardinality-cases.json';
const inspect=(schema:unknown)=>inspectAvroFieldShape([{root:parseNativeJson(JSON.stringify(schema))}],'n.Example','value');
const field=(type:unknown)=>({type:'record',name:'Example',namespace:'n',fields:[{name:'value',type}]});

test('native discovery types retain outer shape, branch order and item paths without claiming item or availability equivalence',()=>{
 for(const c of fixture.cases){
  const root=parseNativeJson(c.schema),before=renderTree(root),result=inspectAvroFieldShape([{root}],'cardinality.Example','value');
  const expected=c.id.startsWith('array-map-union')?'unspecified':['map-of-arrays','empty-map','exact-string-keys','special-property-keys','nullable-map-values','nested-maps'].includes(c.id)?'map':'array';
  expect(result.shape).toBe(expected);
  expect(result.allowsNull).toBe(['nullable-array-present','nullable-array-null','array-null-last'].includes(c.id));
  expect(result.field).toEqual({path:'/fields/0'});
  for(const b of result.branches){
   if(b.shape==='array'||b.shape==='map'){
    expect(b.item?.location.path).toBe(b.location.path+(b.shape==='array'?'/items':'/values'));
    expect(b.item?.native).toBeDefined();
   }
  }
  expect(renderTree(root)).toBe(before);
  expect(before).toContain('9007199254740993');
  result.branches[0]!.native={kind:'null'};
  expect(renderTree(root)).toBe(before);
 }
 const mixed=inspect(field(['null','long','string']));expect(mixed.shape).toBe('one');expect(mixed.branches.map(b=>b.type)).toEqual(['null','long','string']);
 expect(inspect(field('null')).shape).toBe('unspecified');
 expect(inspect(field({type:'long',logicalType:'future-kind',scale:9007199254740992})).shape).toBe('one');
});

test('qualified dependency and recursive references retain separate definition locations',()=>{
 const dependency=parseNativeJson(JSON.stringify({type:'record',name:'dep.Item',fields:[{name:'next',type:['null','dep.Item']}]}));
 const root=parseNativeJson(JSON.stringify(field('dep.Item')));
 const roots=[{root:dependency,dependencyId:'types'},{root}];
 const result=inspectAvroFieldShape(roots,'n.Example','value');
 expect(result.shape).toBe('one');expect(result.branches[0]!.definition).toEqual({path:'',dependencyId:'types'});
 const recursive=inspectAvroFieldShape(roots,'dep.Item','next');
 expect(recursive.shape).toBe('one');expect(recursive.allowsNull).toBe(true);
 expect(recursive.branches[1]!.definition).toEqual({path:'',dependencyId:'types'});
 expect(recursive.branches[1]!.location).toEqual({path:'/fields/0/type/1',dependencyId:'types'});
 const nested=fixture.cases.find(c=>c.id==='recursive-record-items')!;
 const children=inspectAvroFieldShape([{root:parseNativeJson(nested.schema)}],'cardinality.Item','children');
 expect(children.shape).toBe('array');expect(children.branches[0]!.item!.native).toEqual({kind:'string',value:'Item'});
 expect(()=>inspectAvroFieldShape(roots,'Item','next')).toThrow();
});

test('ambiguous, missing and invalid structural type syntax refuses rather than defaulting to one',()=>{
 for(const type of [
  'Missing',[],['long','long'],[['null','long'],'string'],
  {type:'array'},{type:'map'},{type:'array',items:'Missing'},
  {type:'enum',name:'Choice',symbols:['A','A']},
  {type:'fixed',name:'Bits',size:0},{type:'fixed',name:'Bits',size:9007199254740992},
  [{type:'record',name:'Same',fields:[]},{type:'record',name:'Same',fields:[]}],
 ])expect(()=>inspect(field(type))).toThrow();
 const duplicate={...field('long'),fields:[{name:'value',type:'long'},{name:'value',type:'string'}]};expect(()=>inspect(duplicate)).toThrow();
 const forward={...field('Later'),fields:[{name:'value',type:'Later'},{name:'later',type:{type:'record',name:'Later',fields:[]}}]};expect(()=>inspect(forward)).toThrow();
 const root=parseNativeJson(JSON.stringify(field('long')));
 expect(()=>inspectAvroFieldShape([{root},{root}],'n.Example','value')).toThrow();
 expect(()=>inspectAvroFieldShape([{root,dependencyId:'x'},{root,dependencyId:'x'},{root}],'n.Example','value')).toThrow();
 expect(()=>inspectAvroFieldShape([{root}],'n.Example','missing')).toThrow();
 expect(()=>inspectAvroFieldShape([],'n.Example','value')).toThrow();
});


test('nested item/value traversal uses registered type locations and keeps container/member availability separate',()=>{
 const schema=field({type:'array',items:{type:'map',values:['null',{type:'array',items:'long'}]}});
 const roots=[{root:parseNativeJson(JSON.stringify(schema))}];
 const container=inspectAvroFieldShape(roots,'n.Example','value');
 expect(container.shape).toBe('array');expect(container.allowsNull).toBe(false);
 const member=inspectAvroTypeShape(roots,container.branches[0]!.item!.location);
 expect(member.shape).toBe('map');expect(member.allowsNull).toBe(false);
 const value=inspectAvroTypeShape(roots,member.branches[0]!.item!.location);
 expect(value.shape).toBe('array');expect(value.allowsNull).toBe(true);
 expect(value.branches.map(b=>b.type)).toEqual(['null','array']);
 const leaf=inspectAvroTypeShape(roots,value.branches[1]!.item!.location);
 expect(leaf.shape).toBe('one');expect(leaf.allowsNull).toBe(false);
 expect(leaf.location.path).toBe('/fields/0/type/items/values/1/items');
 expect(inspectAvroTypeShape(roots,{path:''}).branches[0]!.type).toBe('record');
 for(const path of ['/fields/0','/fields/0/name','/fields/0/type/type','/fields/0/type/items/values/2','/futureMeaning'])expect(()=>inspectAvroTypeShape(roots,{path})).toThrow();
 const opaque=field('long') as unknown as {fields:Record<string,unknown>[]};opaque.fields[0]!.default={type:'array',items:'long'};
 expect(()=>inspectAvroTypeShape([{root:parseNativeJson(JSON.stringify(opaque))}],{path:'/fields/0/default'})).toThrow();
 const dependency=parseNativeJson(JSON.stringify({type:'record',name:'dep.Item',fields:[]}));
 const namedRoots=[{root:dependency,dependencyId:'one'},{root:parseNativeJson(JSON.stringify(field({type:'array',items:'dep.Item'})))}];
 const named=inspectAvroTypeShape(namedRoots,{path:'/fields/0/type/items'});
 expect(named.branches[0]!.definition).toEqual({path:'',dependencyId:'one'});
 const definition=inspectAvroTypeShape(namedRoots,named.branches[0]!.definition!);expect(definition.branches[0]!.type).toBe('record');
 expect(()=>inspectAvroTypeShape(namedRoots,{path:'',dependencyId:'missing'})).toThrow();
});
