import {test,expect} from 'bun:test';
import {importSmithyJson,exportSmithyJson,exportSmithyBundle,getSmithyNode,proposeSmithyNodeEdit,inspectSmithy,writeDocument,readDocument} from '../../src';
async function bundle(){return importSmithyJson(await Bun.file('fixtures/smithy/upstream/use/use-shapes.json').text(),{id:'bundle',dependencies:[{id:'widget',schema:await Bun.file('fixtures/smithy/bundles/widget.json').text()}]});}
test('US-014-AC5: supplied dependency models survive bundle and UMF round trips',async()=>{
 const doc=await bundle();const exported=exportSmithyBundle(doc);
 expect(exported.dependencies.length).toBe(1);expect(exported.dependencies[0]!.id).toBe('widget');
 expect(getSmithyNode(doc,'/metadata/dependencyExact','widget')).toEqual({kind:'number',value:'9007199254740993'});
 for(const format of ['json','yaml'] as const)expect(exportSmithyBundle(readDocument(writeDocument(doc,format),format))).toEqual(exported);
 expect(exportSmithyBundle(importSmithyJson(exported.schema,{id:'bundle',dependencies:exported.dependencies}))).toEqual(exported);
 expect(()=>exportSmithyJson(doc)).toThrow('exportSmithyBundle');expect(inspectSmithy(doc).complete).toBe(false);
 const path='/shapes/foo.example#Widget/members/id/target';const edit=proposeSmithyNodeEdit(doc,path,'"smithy.api#Integer"','widget');
 expect(getSmithyNode(edit.document,path,'widget')).toEqual({kind:'string',value:'smithy.api#Integer'});expect(getSmithyNode(doc,path,'widget')).toEqual({kind:'string',value:'smithy.api#String'});
 expect(()=>getSmithyNode(doc,'','missing')).toThrow('Unknown dependency');expect(()=>proposeSmithyNodeEdit(doc,'','{}','missing')).toThrow('Unknown dependency');
});
test('US-014-AC6: duplicate IDs, malformed dependency AST and unknown representation are explicit',async()=>{
 const doc=await bundle();const out=exportSmithyBundle(doc);
 expect(()=>importSmithyJson(out.schema,{id:'duplicate',dependencies:[...out.dependencies,...out.dependencies]})).toThrow('Duplicate dependency');
 expect(()=>importSmithyJson(out.schema,{id:'invalid',dependencies:[{id:'bad',schema:'{"smithy":"2.0","shapes":{"a#L":{"type":"list"}}}'}]})).toThrow('SMITHY_STRUCTURE');
 const p=doc.modules[0]!.elements[0]!.extensions!['umf.smithy'] as any;p.dependencies[0].future={mustKeep:true};
 const restored=readDocument(writeDocument(doc,'yaml'),'yaml');expect(restored).toEqual(doc);expect(()=>exportSmithyBundle(restored)).toThrow('Unknown representation');
});
