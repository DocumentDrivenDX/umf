import {createValidator} from '../../src/validation/schema';
import {coreSchema,typespecSemanticGraphSchema} from '../../src';
import {test,expect} from 'bun:test';
import {importTypeSpecSources,getTypeSpecSemanticGraph,writeDocument,readDocument,proposeTypeSpecSourceEdit} from '../../src';
async function source(){return importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':await Bun.file('fixtures/typespec/project/main.tsp').text(),'common.tsp':await Bun.file('fixtures/typespec/project/common.tsp').text()}},{id:'semantic'});}
test('US-013-AC5: compiled graph preserves recursion, inheritance, operations and exact literals',async()=>{
 const doc=await source();const graph=await getTypeSpecSemanticGraph(doc,{roots:['Sales.Order','Sales.Orders']});
 const validate=createValidator();validate.addSchema(coreSchema);expect(validate.compile(typespecSemanticGraphSchema)(graph)).toBe(true);
 expect(graph.status).toBe('available');expect(graph.complete).toBe(false);expect(graph.source).toEqual(doc);
 const order=graph.nodes.find(n=>n.id===graph.roots[0]!.target)!;expect(order.kind).toBe('Model');expect(order.attributes.doc).toContain('Customer order');
 expect(order.edges.some(e=>e.role==='baseModel')).toBe(true);
 const byId=new Map(graph.nodes.map(n=>[n.id,n]));for(const node of graph.nodes)for(const edge of node.edges)expect(byId.has(edge.target)).toBe(true);
 const related=byId.get(order.edges.find(e=>e.name==='related')!.target)!;const array=byId.get(related.edges.find(e=>e.role==='type')!.target)!;
 expect(array.edges.find(e=>e.role==='indexValue')!.target).toBe(order.id);
 expect(graph.nodes.some(n=>JSON.stringify(n.attributes.value)==='{"kind":"number","value":"9007199254740993"}')).toBe(true);
 const total=byId.get(order.edges.find(e=>e.name==='total')!.target)!;expect((total.attributes.default as any).value).toBe('42');
 expect(graph.nodes.filter(n=>n.kind==='Operation').length).toBe(2);
 const round=await getTypeSpecSemanticGraph(readDocument(writeDocument(doc,'yaml'),'yaml'),{roots:['Sales.Order','Sales.Orders']});expect(round).toEqual(graph);
 await Bun.write('fixtures/typespec/semantic-graph.json',JSON.stringify(graph,null,2)+'\n');
});
test('US-013-AC6: invalid compilation and unresolved selections cannot claim available graphs',async()=>{
 const doc=await source();expect((await getTypeSpecSemanticGraph(doc,{roots:['Sales.Absent']})).status).toBe('blocked');
 const changed=proposeTypeSpecSourceEdit(doc,'main.tsp','model Broken { n: string = 42; }');
 const graph=await getTypeSpecSemanticGraph(changed.document,{roots:['Broken']});expect(graph.status).toBe('blocked');expect(graph.nodes).toEqual([]);
 expect(()=>getTypeSpecSemanticGraph(doc,{roots:[]})).toThrow();
});
