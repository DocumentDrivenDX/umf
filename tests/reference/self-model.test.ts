// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {loadSelfModel} from '../../scripts/reference/self-model';
import {selfModelGraph,canonical,type SelfModelCatalog} from '../../docs/helix/05-deploy/reference/model';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {parse,stringify} from 'yaml';
import {sourceText,read} from '../../scripts/reference/io';
import {buildSelfModel,modelPath} from '../../scripts/reference/self-model';
import {rustReferenceSelfModel} from '../../scripts/metamodel/rust';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const catalog=await loadSelfModel(),model=catalog.document;

test('R7 CLI preserves exact admission errors and does not misclassify source-derived identifiers',async()=>{
 const source=await sourceText(modelPath),baseManifest=await read('spec/metamodel/generated/manifest.json');
 const errorMessage=async(sourceText:string,manifest:unknown)=>{
  try{await rustReferenceSelfModel(sourceText,manifest)}catch(error){return (error as Error).message}
  throw Error('Expected self-model CLI admission to fail');
 };
 expect(await errorMessage(source.replace('umf: 0.10.0','umf: 0.10.1'),baseManifest)).toBe('SELF_MODEL_SOURCE unexpected authored metamodel identity');
 expect(await errorMessage(source+'\n# stale provenance fixture\n',baseManifest)).toBe('SELF_MODEL_PROVENANCE authored model/compiler manifest mismatch');

 const unresolvedDocument:any=parse(source);
 unresolvedDocument.modules[0].elements.find((element:any)=>element.id==='document').members[0].element='SELF_MODEL_SOURCE';
 const unresolvedSource=stringify(unresolvedDocument),manifest=structuredClone(baseManifest);
 const digest=new Bun.CryptoHasher('sha256').update(unresolvedSource).digest('hex');
 manifest.sources[modelPath]=digest;manifest.provenance.modelSha256=digest;
 const unresolvedError=await errorMessage(unresolvedSource,manifest);
 expect(unresolvedError).toContain('SELF_MODEL_UNRESOLVED');
 expect(unresolvedError).toContain('SELF_MODEL_SOURCE');
 expect(unresolvedError).not.toBe('SELF_MODEL_SOURCE unexpected authored metamodel identity');
});

test('US-089-AC17: reference reads authored current model and verifies compiler provenance',async()=>{
 expect(canonical(model)).toBe(canonical(parse(await sourceText('spec/metamodel/umf.yaml'))));
 expect(model.umf).toBe('0.10.0');expect(catalog.provenance.modelSha256).toBe(catalog.sources[0]!.sha256);
 const copy:any=structuredClone(model);copy.extensions!['future.annotation']={unknown:['kept',{'1':false}]};copy.vocabularies['future.annotation']={version:'7.0.0'};
 for(const format of ['yaml','json'] as const)expect(canonical(readJsonValue(writeJsonValue(copy,format),format))).toBe(canonical(copy));
});

test('R7 source-bound self-model build stages admitted catalog and exact authored source',async()=>{
 const stage=await mkdtemp(join(tmpdir(),'umf-r7-self-model-'));
 try{
  await buildSelfModel(stage);
  expect(JSON.parse(await readFile(join(stage,'metamodel.json'),'utf8'))).toEqual(catalog);
  expect(await readFile(join(stage,'umf.yaml'),'utf8')).toBe(await sourceText('spec/metamodel/umf.yaml'));
  expect(JSON.parse(await readFile(join(stage,'umf.json'),'utf8'))).toEqual(model);
 }finally{await rm(stage,{recursive:true,force:true})}
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

test('R7 predecessor controls: graph containers use direct flatMap/map semantics',()=>{
 const cases:[(c:any)=>void,string][]=[
  [c=>{delete c.document.modules},"undefined is not an object (evaluating 'catalog.document.modules.flatMap')"],
  [c=>{c.document.modules=null},"null is not an object (evaluating 'catalog.document.modules.flatMap')"],
  [c=>{c.document.modules={}},"catalog.document.modules.flatMap is not a function."],
  [c=>{delete c.document.modules[0].elements},"undefined is not an object (evaluating 'm.elements.map')"],
  [c=>{c.document.modules[0].elements=null},"null is not an object (evaluating 'm.elements.map')"],
  [c=>{c.document.modules[0].elements={}},"m.elements.map is not a function."],
 ];
 for(const [mutate,message] of cases){const copy=JSON.parse(JSON.stringify(catalog));mutate(copy);expect(()=>selfModelGraph(copy)).toThrow(message)}
});

test('R7 predecessor controls: labels preserve false and shape traversal skips arrays',()=>{
 const copy=JSON.parse(JSON.stringify(catalog));
 const elements=copy.document.modules.flatMap((m:any)=>m.elements);
 const record=elements.find((e:any)=>e.kind==='record'),field=elements.find((e:any)=>e.kind==='field');
 record.name=false;field.name=false;
 field.extensions??={};field.extensions['umf.metamodel']??={};
 const baseline=selfModelGraph(copy);
 expect(baseline.records.find((r:any)=>r.id===JSON.stringify(['umf',record.id]))!.label).toBe(false);
 expect(baseline.fields.find((f:any)=>f.id===JSON.stringify(['umf',field.id]))!.label).toBe(false);
 const baseEdgeCount=baseline.edges.length;
 field.extensions['umf.metamodel'].shape=[{tag:'link',target:'missing-array-target'}];
 expect(selfModelGraph(copy).edges.length).toBe(baseEdgeCount);
 field.extensions['umf.metamodel'].shape={nested:[[{tag:'link',target:'missing-nested-array-target'}]]};
 expect(selfModelGraph(copy).edges.length).toBe(baseEdgeCount);
});

test('R7 predecessor controls: field edge labels use ECMAScript ToString',()=>{
 const edgeLabel=(name:any)=>{const copy=JSON.parse(JSON.stringify(catalog));const elements=copy.document.modules[0].elements as any[];elements.find(e=>e.id==='document.modules').name=name;return selfModelGraph(copy).edges.find((e:any)=>e.source==='["umf","document"]'&&e.target==='["umf","module"]')!.label};
 expect(edgeLabel(1e-7)).toBe('1e-7');
 expect(edgeLabel({})).toBe('[object Object]');
 expect(edgeLabel(['a','b'])).toBe('a,b');
 expect(edgeLabel([1e-7,['a',null],{}])).toBe('1e-7,a,,[object Object]');
 expect(()=>edgeLabel({toString:'blocked'})).toThrow('No default value');
});

test('R7 predecessor controls: members and references retain direct JS method failures',()=>{
 const members=JSON.parse(JSON.stringify(catalog));members.document.modules[0].elements.find((e:any)=>e.id==='document').members=false;
 expect(()=>selfModelGraph(members)).toThrow('false is not iterable');
 const nullMember=JSON.parse(JSON.stringify(catalog));nullMember.document.modules[0].elements.find((e:any)=>e.id==='document').members=[null];
 expect(()=>selfModelGraph(nullMember)).toThrow("null is not an object (evaluating 'member.module')");
 const references=JSON.parse(JSON.stringify(catalog));references.document.modules[0].elements.find((e:any)=>e.id==='document.modules').references={};
 expect(()=>selfModelGraph(references)).toThrow('field.references?.filter is not a function.');
 const nullReference=JSON.parse(JSON.stringify(catalog));nullReference.document.modules[0].elements.find((e:any)=>e.id==='document.modules').references=[null];
 expect(()=>selfModelGraph(nullReference)).toThrow("null is not an object (evaluating 'r.role')");
});

test('R7 predecessor controls: reached preowned text is not capped by an internal text-unit limit',()=>{
 const copy=JSON.parse(JSON.stringify(catalog));const field=copy.document.modules[0].elements.find((e:any)=>e.id==='document.modules');
 field.name='x'.repeat(4_000_001);
 const graph=selfModelGraph(copy);
 expect(graph.fields.find((f:any)=>f.id==='["umf","document.modules"]')!.label.length).toBe(4_000_001);
});
