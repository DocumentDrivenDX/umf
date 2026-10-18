import {test,expect} from 'bun:test';
import {loadSelfModel,expectedSelfModel} from '../../scripts/reference/self-model';
import {selfModelGraph,canonical,type SelfModelCatalog} from '../../docs/helix/05-deploy/reference/model';
import {readDocument,writeDocument,validateDocument,Registry,type ExtensionPackage} from '../../src/index';
const pkg=await Bun.file('spec/metamodel/package.json').json();
const model=await loadSelfModel(),catalog={profile:'umf.metamodel/1',document:model,sources:[]} as unknown as SelfModelCatalog;
test('US-089-AC17: self-model matches bootstrap, composes vocabulary and preserves unknowns in YAML/JSON',async()=>{
 expect(canonical(model)).toBe(canonical(await expectedSelfModel()));
 const result=validateDocument(model,new Registry().register(pkg as ExtensionPackage));expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(new Set(result.diagnostics.map(d=>d.code))).toEqual(new Set(['SEMANTICS_UNCHECKED','EXPERIMENTAL_CORE_SEMANTIC_TYPES']));
 const copy=structuredClone(model);copy.extensions!['future.annotation']={unknown:['kept',{'1':false}]};copy.vocabularies['future.annotation']={version:'7.0.0'};
 expect(validateDocument(copy).valid).toBe(true);expect(validateDocument(copy).complete).toBe(false);
 for(const format of ['yaml','json'] as const)expect(canonical(readDocument(writeDocument(copy,format),format))).toBe(canonical(copy));
});
test('US-089-AC17: current property coverage, role prohibitions, exact constraints and semantic term references',async()=>{
 const core=await Bun.file('spec/core/semantic-types-document.schema.json').json(),elements=model.modules[0]!.elements as any[];
 const doc=elements.find(e=>e.id==='document'),field=elements.find(e=>e.id==='field'),record=elements.find(e=>e.id==='record');
 expect(doc.members.map((r:any)=>r.element)).toEqual(Object.keys(core.properties).map(k=>'document.'+k));
 expect(field.members.map((r:any)=>r.element)).toContain('field.itemType');expect(record.members.map((r:any)=>r.element)).not.toContain('record.scalarType');
 expect(field.extensions['umf.metamodel'].schema).toEqual(core.$defs.element);
 expect(elements.find(e=>e.id==='field.semanticTypes.$item').references).toEqual([{role:'record-type',module:'umf',element:'semanticType'}]);
 const annotation=elements.find(e=>e.id==='field.itemType').extensions['umf.metamodel'];expect(annotation.schema).toEqual(core.$defs.element.properties.itemType);expect(annotation.presence).toContain('Conditional');
 const defaultValue=elements.find(e=>e.id==='default.value');expect(defaultValue.nullability).toBeUndefined();expect(defaultValue.extensions['umf.metamodel'].presence).toBe('Required');expect(core.$defs.literal.oneOf.some((branch:any)=>branch.type==='null')).toBe(true);
});
test('US-089-AC18: graph uses qualified model references and refuses unresolved targets',()=>{
 const graph=selfModelGraph(catalog);expect(graph.records.length).toBe(20);expect(graph.edges.length).toBeGreaterThan(25);
 expect(graph.edges.some(e=>e.label==='modules[]'&&e.target===JSON.stringify(['umf','module']))).toBe(true);
 expect(graph.edges.some(e=>e.label==='resolves item Field'&&e.source===JSON.stringify(['umf','itemType']))).toBe(true);
 const broken=structuredClone(catalog);broken.document.modules[0]!.elements=broken.document.modules[0]!.elements.filter(e=>e.id!=='field');expect(()=>selfModelGraph(broken)).toThrow('SELF_MODEL_UNRESOLVED');
 const spoof=structuredClone(catalog);spoof.document.modules[0]!.elements.find(e=>e.id==='document')!.extensions['umf.metamodel'].connections[0].target.module='unrelated';expect(()=>selfModelGraph(spoof)).toThrow('SELF_MODEL_UNRESOLVED');
});
