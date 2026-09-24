import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import schema from '../../spec/extensions/shacl/target-nodes-schema.json';
import {importShaclTurtle,importRdfTurtle,importRdfTriG,getShaclTargetNodes,getShaclQuads,getRdfQuads,proposeShaclQuadEdit,exportShaclTurtle,readDocument,writeDocument} from '../../src';
const baseIRI='https://example.org/',iri=(name:string)=>({kind:'iri' as const,value:baseIRI+name}),options={id:'shapes',baseIRI};
const prefix='@prefix ex: <https://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . ';
test('US-028 Core target sets match native SPARQL across official and authored graphs',async()=>{
 const matrix=await Bun.file('fixtures/shacl/target-results.json').json(),oracle=await Bun.file('fixtures/shacl/target-oracle-results.json').json(),check=new Ajv2020({strict:false}).compile(schema);expect(matrix.cases).toHaveLength(8);expect(oracle.results.length).toBe(matrix.cases.flatMap((c:any)=>c.results).length);expect(oracle.results.every((r:any)=>r.equal)).toBe(true);
 for(const c of matrix.cases){const raw=await Bun.file(c.shapes).text(),shapes=importShaclTurtle(raw,{id:c.shapes,baseIRI:c.baseIRI}),data=importRdfTurtle(await Bun.file(c.data).text(),{id:c.data,baseIRI:c.baseIRI});for(const r of c.results){const actual=getShaclTargetNodes(shapes,r.shape,data);expect(check(actual)).toBe(true);expect(actual).toEqual(r.values);}expect(exportShaclTurtle(shapes)).toBe(raw);}
},30000);
test('US-028 graph boundaries, exact literals, cycles, deactivation and atomic target edit',async()=>{
 const source=await Bun.file('native/shacl/targets-shapes.ttl').text(),shapes=importShaclTurtle(source,options),data=importRdfTurtle(await Bun.file('native/shacl/targets-data.ttl').text(),{id:'data',baseIRI});
 expect(getShaclTargetNodes(shapes,iri('class'),data).map(n=>n.value).sort()).toEqual(['a','b','c'].map(n=>baseIRI+n));expect(getShaclTargetNodes(shapes,iri('Implicit'),data)).toEqual([iri('c')]);expect(getShaclTargetNodes(shapes,iri('none'),data)).toEqual([]);expect(getShaclTargetNodes(shapes,iri('inactive'),data)).toEqual([iri('absent')]);expect(getShaclTargetNodes(shapes,iri('explicit'),data).some(n=>n.value==='9007199254740993')).toBe(true);
 const qs=getShaclQuads(shapes),i=qs.findIndex(q=>q.subject.value===baseIRI+'class'&&q.predicate.value.endsWith('#targetClass')),q=qs[i]!;q.object=iri('Never');const edit=proposeShaclQuadEdit(shapes,i,q).document;for(const format of ['json','yaml'] as const)expect(getShaclTargetNodes(readDocument(writeDocument(edit,format),format),iri('class'),data)).toEqual([]);expect(exportShaclTurtle(shapes)).toBe(source);
 const sg=importShaclTurtle(prefix+'_:same sh:targetObjectsOf ex:p .',{...options,blankNodeScope:'shapes-local'}),dg=importRdfTurtle(prefix+'ex:a ex:p _:same .',{id:'data',baseIRI,blankNodeScope:'data-local'}),shape=getShaclQuads(sg)[0]!.subject;
 const nodes=getShaclTargetNodes(sg,shape,dg);expect(nodes).toEqual([getRdfQuads(dg)[0]!.object]);nodes[0]!.value='changed';expect(getShaclTargetNodes(sg,shape,dg)).not.toEqual(nodes);
 expect(()=>getShaclTargetNodes(shapes,iri('class'),importRdfTriG(prefix+'ex:g {}',{id:'data',baseIRI}))).toThrow();
});
test('US-028 malformed or unsupported target declarations cannot silently select a subset',()=>{
 const data=importRdfTurtle('',{id:'data',baseIRI});
 for(const text of ['ex:s sh:targetNode _:b .','ex:s sh:targetClass "class" .','ex:s sh:targetSubjectsOf _:p .','ex:s sh:targetObjectsOf "p" .','ex:s sh:targetNode ex:a ; sh:target [ a ex:Custom ] .','ex:s <http://www.w3.org/2002/07/owl#imports> ex:remote .','ex:s sh:entailment ex:Reasoner .']){const d=importShaclTurtle(prefix+text,options);expect(()=>getShaclTargetNodes(d,iri('s'),data)).toThrow();expect(exportShaclTurtle(d)).toBe(prefix+text);}
 const implicit=importShaclTurtle(prefix+'_:s a sh:NodeShape,rdfs:Class .',options);expect(()=>getShaclTargetNodes(implicit,getShaclQuads(implicit)[0]!.subject,data)).toThrow();
 const d=importShaclTurtle(prefix+'ex:s sh:targetNode ex:a .',options);expect(()=>getShaclTargetNodes(d,{kind:'iri',value:'bad iri'},data)).toThrow();(d.modules[0]!.elements[0]!.extensions['umf.shacl'] as any).future={meaning:'retain'};expect(()=>getShaclTargetNodes(d,iri('s'),data)).toThrow();
});
