// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {loadSelfModel,expectedSelfModel} from '../../scripts/reference/self-model';
import {selfModelGraph,canonical,type SelfModelCatalog} from '../../docs/helix/05-deploy/reference/model';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const catalog=await loadSelfModel(),model=catalog.document;

test('US-089-AC17: reference reads authored current model and verifies compiler provenance',async()=>{
 expect(canonical(model)).toBe(canonical(await expectedSelfModel()));
 expect(model.umf).toBe('0.10.0');expect(catalog.provenance.modelSha256).toBe(catalog.sources[0]!.sha256);
 const copy:any=structuredClone(model);copy.extensions!['future.annotation']={unknown:['kept',{'1':false}]};copy.vocabularies['future.annotation']={version:'7.0.0'};
 for(const format of ['yaml','json'] as const)expect(canonical(readJsonValue(writeJsonValue(copy,format),format))).toBe(canonical(copy));
});

test('US-089-AC17: the reference consumes authored Record members and Field shapes, never reverse-extracts schema fragments',()=>{
 const elements=model.modules[0]!.elements as any[];
 const document=elements.find(e=>e.id==='document'),element=elements.find(e=>e.id==='element');
 expect(document.kind).toBe('record');expect(document.members.map((r:any)=>r.element)).toContain('document.modules');
 expect(element.kind).toBe('record');expect(element.members.map((r:any)=>r.element)).toContain('element.itemType');
 const item=elements.find(e=>e.id==='element.itemType');
 expect(item.extensions['umf.metamodel'].shape).toEqual({tag:'link',target:'itemType'});
 expect(item.extensions['umf.metamodel'].schema).toBeUndefined();
 expect(elements.every(e=>e.extensions?.['umf.metamodel']?.schema===undefined)).toBe(true);
});

test('US-089-AC18: graph uses one node per authored Record and Field and refuses unresolved members',()=>{
 const graph=selfModelGraph(catalog);
 const authored=model.modules.flatMap(module=>module.elements.map(element=>({id:JSON.stringify([module.id,element.id]),kind:element.kind})));
 expect(graph.records.map(node=>node.id).sort()).toEqual(authored.filter(element=>element.kind==='record').map(element=>element.id).sort());
 expect(graph.fields.map(node=>node.id).sort()).toEqual(authored.filter(element=>element.kind==='field').map(element=>element.id).sort());
 expect(new Set(graph.fields.map(f=>f.id)).size).toBe(graph.fields.length);
 expect(graph.edges.some(e=>e.source===JSON.stringify(['umf','document'])&&e.target===JSON.stringify(['umf','module'])&&e.label==='modules')).toBe(true);
 expect(graph.edges.some(e=>e.source===JSON.stringify(['umf','module'])&&e.target===JSON.stringify(['umf','element'])&&e.label==='elements')).toBe(true);
 const broken=structuredClone(catalog) as SelfModelCatalog;
 broken.document.modules[0]!.elements.find(e=>e.id==='document')!.members[0]!.element='missing-field';
 expect(()=>selfModelGraph(broken)).toThrow('SELF_MODEL_UNRESOLVED member');
});
