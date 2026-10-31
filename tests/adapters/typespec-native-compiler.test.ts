// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 compileTypeSpecDocument,emitTypeSpecJsonSchema,getTypeSpecSemanticGraph,
 importTypeSpecSources,
} from '../../src/index-node-v4';

test('pinned TypeSpec compiler, semantic graph and emitter run through the public Rust default',async()=>{
 const doc=importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':'import "@typespec/json-schema"; using JsonSchema; @jsonSchema namespace Api { model Item { id: string; } }'},libraries:{'@typespec/json-schema':'1.16.0'}},{id:'rust-typespec'});
 const compilation=await compileTypeSpecDocument(doc);
 expect(compilation.compiler).toBe('@typespec/compiler@1.16.0');
 expect(compilation.valid).toBe(true);
 expect(compilation.complete).toBe(false);
 const graph=await getTypeSpecSemanticGraph(doc,{roots:['Api.Item']});
 expect(graph.status).toBe('available');
 expect(graph.source).toEqual(doc);
 expect(graph.roots.map(root=>root.expression)).toEqual(['Api.Item']);
 expect(graph.nodes.some(node=>node.kind==='Model'&&node.label==='Api.Item')).toBe(true);
 const emission=await emitTypeSpecJsonSchema(doc,{options:{'file-type':'json','int64-strategy':'string'}});
 expect(emission.status).toBe('emitted');
 expect(emission.source).toEqual(doc);
 expect(Object.keys(emission.files).length).toBeGreaterThan(0);
});

test('invalid TypeSpec path is refused by Rust before the compiler capability',async()=>{
 const doc=importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':'model Item { id: string; }'}},{id:'rust-typespec-invalid'});
 (doc.modules[0]!.elements[0]!.extensions['umf.typespec'] as any).entrypoint='../main.tsp';
 await expect(compileTypeSpecDocument(doc)).rejects.toMatchObject({code:'TYPESPEC_ENTRYPOINT'});
});
