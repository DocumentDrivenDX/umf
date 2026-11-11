// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {assembleSmithyDocument,importSmithyJson,exportSmithyJson,exportSmithyBundle,getSmithyNode,proposeSmithyNodeEdit,inspectSmithy,writeDocument,readDocument} from '../../src';
async function bundle(){return importSmithyJson(await Bun.file('fixtures/smithy/upstream/use/use-shapes.json').text(),{id:'bundle',dependencies:[{id:'widget',schema:await Bun.file('fixtures/smithy/bundles/widget.json').text()}]});}
test('US-014-AC5: supplied dependency models survive bundle and UMF round trips',async()=>{
 const doc=await bundle();const exported=exportSmithyBundle(doc);
 expect(exported.dependencies.length).toBe(1);expect(exported.dependencies[0]!.id).toBe('widget');
 expect(getSmithyNode(doc,'/metadata/dependencyExact','widget')).toEqual({kind:'number',value:'9007199254740993'});
 for(const format of ['json','yaml'] as const)expect(exportSmithyBundle(readDocument(writeDocument(doc,format),format))).toEqual(exported);
 expect(exportSmithyBundle(importSmithyJson(exported.schema,{id:'bundle',dependencies:exported.dependencies}))).toEqual(exported);
 expect(()=>exportSmithyJson(doc)).toThrow('Use exportBundle to retain supplied dependencies');expect(inspectSmithy(doc).complete).toBe(false);
 const path='/shapes/foo.example#Widget/members/id/target';const edit=proposeSmithyNodeEdit(doc,path,'"smithy.api#Integer"','widget');
 expect(getSmithyNode(edit.document,path,'widget')).toEqual({kind:'string',value:'smithy.api#Integer'});expect(getSmithyNode(doc,path,'widget')).toEqual({kind:'string',value:'smithy.api#String'});
 expect(()=>getSmithyNode(doc,'','missing')).toThrow('Unknown dependency');expect(()=>proposeSmithyNodeEdit(doc,'','{}','missing')).toThrow('Unknown dependency');
});
test('US-014-AC6: duplicate IDs, malformed dependency AST and unknown representation are explicit',async()=>{
 const doc=await bundle();const out=exportSmithyBundle(doc);
 expect(()=>importSmithyJson(out.schema,{id:'duplicate',dependencies:[...out.dependencies,...out.dependencies]})).toThrow('Dependency IDs must be unique');
 expect(()=>importSmithyJson(out.schema,{id:'invalid',dependencies:[{id:'bad',schema:'{"smithy":"2.0","shapes":{"a#L":{"type":"list"}}}'}]})).toThrow('Structure checked; semantics not validated');
 const p=doc.modules[0]!.elements[0]!.extensions!['umf.smithy'] as any;p.dependencies[0].future={mustKeep:true};
 const restored=readDocument(writeDocument(doc,'yaml'),'yaml');expect(restored).toEqual(doc);
 expect(inspectSmithy(restored).diagnostics.some(d=>d.code==='SMITHY_REPRESENTATION'&&d.path.endsWith('/dependencies/0/future'))).toBe(true);
 expect(()=>exportSmithyBundle(restored)).toThrow('Unknown dependency representation cannot be exported');
 let backendCalls=0;
 const backend={identity:'smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1',assemble(){backendCalls++;return '{}';}};
 await expect(assembleSmithyDocument(restored,backend,{id:'assembled'})).rejects.toMatchObject({code:'SMITHY_REPRESENTATION'});
 expect(backendCalls).toBe(0);
});
