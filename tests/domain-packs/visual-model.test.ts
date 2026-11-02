import {describe,test,expect} from 'bun:test';
import {recordMapProjection,type ComponentModel} from '../../docs/helix/05-deploy/schema-browser/visual-model';

describe('schema diagram source correspondence',()=>{
 test('same labels, parallel edges and self references retain distinct stable identities',()=>{
  const source={records:[{id:'["a","Record"]',label:'Record'},{id:'["b","Record"]',label:'Record'},{id:'isolated'}],edges:[
   {id:'one',source:'["a","Record"]',target:'["b","Record"]',directed:true},
   {id:'two',source:'["a","Record"]',target:'["b","Record"]',directed:false},
   {id:'self',source:'["a","Record"]',target:'["a","Record"]'},
   {id:'external',source:'["a","Record"]',target:'outside'},
  ],unknown:{native:['kept']}};
  const before=structuredClone(source),full=recordMapProjection(source),focused=recordMapProjection(source,'["b","Record"]');
  expect(full.source).toEqual(before);
  expect(full.visual.nodes).toHaveLength(3);
  expect(full.visual.edges).toHaveLength(3);
  expect(new Set(full.visual.edges.map(edge=>edge.id)).size).toBe(3);
  expect(full.unresolved.map(edge=>edge.id)).toEqual(['external']);
  expect(focused.visual.nodes.map(node=>node.id)).toEqual(full.visual.nodes.slice(0,2).map(node=>node.id));
  expect(focused.edgeIds).toEqual(new Map([['relationship-1','one'],['relationship-2','two']]));
  full.source.unknown.native[0]='changed';
  expect(source).toEqual(before);
 });
 test('ambiguous identity and unknown focus refuse before drawing',()=>{
  const source:ComponentModel={records:[{id:'x'}],edges:[]};
  expect(()=>recordMapProjection(source,'missing')).toThrow('Unknown focus');
  expect(()=>recordMapProjection({...source,records:[{id:'x'},{id:'x'}]})).toThrow('Duplicate record');
  expect(()=>recordMapProjection({...source,edges:[{id:'e',source:'x',target:'x'},{id:'e',source:'x',target:'x'}]})).toThrow('Duplicate relationship');
 });
 test('an isolated focused record remains visible and annotation text is preserved',()=>{
  const notes={b:[{badge:'Changed',tone:'warning',tooltip:'Original <native> declaration',unknown:{retained:true}}]};
  const result=recordMapProjection({records:[{id:'a'},{id:'b'}],edges:[]},'b',notes);
  expect(result.annotations).toEqual(notes);
  notes.b[0]!.tone='positive';
  expect(result.annotations.b![0]!.tone).toBe('warning');
  expect(result.visual.nodes[0]!.detail).toContain('[warning]');
  expect(result.visual.nodes).toHaveLength(1);
  expect(result.visual.nodes[0]!.detail).toContain('Original <native> declaration');
  expect(result.recordIds.get('record-2')).toBe('b');
 });
 test('prototype-named identities remain ordinary source identities',()=>{
  const result=recordMapProjection({records:[{id:'toString'},{id:'__proto__'}],edges:[{id:'constructor',source:'toString',target:'__proto__'}]});
  expect(result.recordIds.get('record-1')).toBe('toString');
  expect(result.visual.edges[0]!.label).toBe('constructor');
 });
});
