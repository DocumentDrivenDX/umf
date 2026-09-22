import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture} from '../../src';
import {inspectParquetCardinalityShape} from '../../src/core-ideals/parquet-cardinality-shape';

const read=async(path:string,id=path)=>captureParquet(new Uint8Array(await Bun.file(path).arrayBuffer()),{id});
test('Parquet Cardinality shape keeps nested roles, member meaning and native bytes separate',async()=>{
 const native=await Bun.file('fixtures/validation/cardinality-parquet-profile-native.json').json();
 for(const row of native.cases){
  const source=await read(row.path,row.id),before=structuredClone(source),r=inspectParquetCardinalityShape(source,1);
  expect(r.nodes[0]!.shape).toBe(row.observations.shape);
  for(const node of r.nodes){
   if(['array','map'].includes(node.shape)){
    expect(node.scalarType).toBeUndefined();expect(node.itemIndex).toBeDefined();
    expect(r.nodes.some(n=>n.index===node.itemIndex)).toBe(true);
   }
   if(node.shape==='map')expect(node.residuals.some(l=>l.reason.includes('unique keys'))).toBe(true);
  }
  if(row.id.startsWith('map-integer-keys'))expect(r.nodes[0]!.residuals.some(l=>l.reason.includes('string carrier'))).toBe(true);
  if(row.id.startsWith('map-unique-strings'))expect(r.nodes[0]!.residuals).toHaveLength(1);
  if(row.id.startsWith('array-nested'))expect(r.nodes.map(n=>n.shape)).toEqual(['array','array','one']);
  if(row.id.startsWith('array-record-members'))expect(r.nodes.map(n=>n.role)).toEqual(['array','record','scalar']);
  expect(source).toEqual(before);
  expect(exportParquetCapture(source)).toEqual(new Uint8Array(await Bun.file(row.path).arrayBuffer()));
 }
});
test('legacy container layouts retain wrappers and key-only uncertainty; malformed structures refuse',async()=>{
 const manifest=await Bun.file('fixtures/parquet/containers/manifest.json').json();
 for(const row of manifest.cases){
  const source=await read(row.path);
  if(row.expected==='blocked'){expect(()=>inspectParquetCardinalityShape(source,1)).toThrow('topology');continue;}
  const r=inspectParquetCardinalityShape(source,1),root=r.nodes[0]!;
  if(row.id==='map-key-only'){expect(root.shape).toBe('unspecified');expect(root.itemIndex).toBeUndefined();expect(root.residuals.length).toBeGreaterThan(0);}
  else expect(root.shape).toBe(row.id.startsWith('list')?'array':'map');
  for(const node of r.nodes){
   const c=node.container;if(!c)continue;
   if(c.kind==='map'||c.repeatedIndex!==c.elementIndex){
    const wrapper=inspectParquetCardinalityShape(source,c.repeatedIndex).nodes[0]!;
    expect(wrapper.shape).toBe('unspecified');expect(wrapper.nativeNullable).toBeNull();
   }
  }
  if(row.id==='list-primitive'){
   expect(r.nodes[1]!.shape).toBe('one');expect(r.nodes[1]!.nativeNullable).toBe(false);
  }
  if(row.id==='list-nested-repeated')expect(r.nodes.map(n=>n.shape)).toEqual(['array','array','one']);
 }
});
test('invalid indexes refuse and returned shape metadata cannot mutate the native source',async()=>{
 const source=await read('fixtures/parquet/cardinality/array-nested-1.parquet');
 for(const index of [0,-1,1.5,NaN,9999])expect(()=>inspectParquetCardinalityShape(source,index)).toThrow();
 const before=structuredClone(source),shape=inspectParquetCardinalityShape(source,1);
 shape.nodes[0]!.path.push('changed');(shape.nodes[0]!.nativeFragment as any).name='changed';
 expect(source).toEqual(before);expect(inspectParquetCardinalityShape(source,1).nodes[0]!.path).toEqual(['value']);
});
test('legacy unannotated repeated values remain unresolved without an explicit interpretation',async()=>{
 for(const version of ['v1','v2']){
  const source=await read('fixtures/parquet/levels/authored/repeated-'+version+'.parquet');
  const r=inspectParquetCardinalityShape(source,1).nodes[0]!;
  expect(r.shape).toBe('unspecified');expect(r.scalarType).toBeUndefined();
  expect(r.nativeNullable).toBeNull();expect(r.residuals[0]!.reason).toContain('legacy interpretation');
 }
});
