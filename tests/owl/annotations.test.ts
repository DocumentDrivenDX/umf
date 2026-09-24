import {test,expect} from 'bun:test';
import Ajv from 'ajv/dist/2020';
import {getOwlAxiomAnnotations,importOwlTurtle,exportOwlTurtle,getOwlQuads,proposeOwlQuadEdit,writeDocument,readDocument} from '../../src';
const E='https://example.org/';
test('US-029 nested axiom annotations preserve term identity and source edits',async()=>{
 const raw=await Bun.file('native/owl/annotations.ttl').text(),doc=importOwlTurtle(raw,{id:'annotations',baseIRI:E,blankNodeScope:'scope'}),ajv=new Ajv({strict:false});ajv.addSchema(await Bun.file('spec/core/schema.json').json());const check=ajv.compile(await Bun.file('spec/extensions/owl/annotations-schema.json').json());
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format),v=getOwlAxiomAnnotations(restored,0);expect(check(v)).toBe(true);expect(v.complete).toBe(false);expect(v.blankNodeScope).toBe('scope');expect(v.roots.map(n=>n.value)).toEqual([E+'ax1',E+'ax2']);expect(v.records.map(r=>r.node.value)).toEqual([E+'ax1',E+'ax2',E+'ann',E+'deep']);expect(v.malformed.map(n=>n.value)).toEqual([E+'bad']);expect(exportOwlTurtle(v.source)).toBe(raw);expect(v.records[2]!.target.object.value).toBe('0.90');expect(v.records[2]!.assertedQuadIndexes).toHaveLength(1);
 const q=getOwlQuads(restored)[0]!;q.object={kind:'iri',value:E+'C'};const next=proposeOwlQuadEdit(restored,0,q).document;expect(getOwlAxiomAnnotations(next,0).roots).toEqual([]);expect(getOwlQuads(next).filter(q=>q.subject.value===E+'ax1')).toHaveLength(6);expect(exportOwlTurtle(restored)).toBe(raw);v.records[0]!.node.value='changed';expect(getOwlAxiomAnnotations(restored,0).roots[0]!.value).toBe(E+'ax1');
 }
 for(const i of [-1,0.5,NaN,10000])expect(()=>getOwlAxiomAnnotations(doc,i)).toThrow();
});
test('US-029 nested annotations expose graph links in traversal order',()=>{
 const raw='@prefix owl: <http://www.w3.org/2002/07/owl#> . <urn:s> <urn:p> <urn:o> . <urn:a> a owl:Axiom ; owl:annotatedSource <urn:s> ; owl:annotatedProperty <urn:p> ; owl:annotatedTarget <urn:o> ; <urn:n> <urn:v> . <urn:b> a owl:Annotation ; owl:annotatedSource <urn:a> ; owl:annotatedProperty <urn:n> ; owl:annotatedTarget <urn:v> ; <urn:n> <urn:v> . <urn:c> a owl:Annotation ; owl:annotatedSource <urn:b> ; owl:annotatedProperty <urn:n> ; owl:annotatedTarget <urn:v> ; <urn:n> <urn:v> .';
 const doc=importOwlTurtle(raw,{id:'s',baseIRI:'urn:base:'}),v=getOwlAxiomAnnotations(doc,0);expect(v.records).toHaveLength(3);expect(v.records[1]!.nested[0]!.value).toBe('urn:c');
});
test('US-029 annotation identity and malformed reifications agree with independent RDF parsing',async()=>{
 const oracle=await Bun.file('fixtures/owl/annotation-case-oracle.json').json(),matrix=await Bun.file('fixtures/owl/annotation-case-results.json').json();expect(oracle.results).toHaveLength(15);expect(oracle.results.every((r:any)=>r.equal)).toBe(true);
 for(const c of matrix){const raw=await Bun.file('native/owl/annotation-cases/'+c.id+'.ttl').text(),doc=importOwlTurtle(raw,{id:c.id,baseIRI:E,blankNodeScope:c.id}),v=getOwlAxiomAnnotations(readDocument(writeDocument(doc,c.format),c.format),0);expect(v.roots.length).toBe(c.roots);expect(v.malformed.length).toBe(c.malformed);expect(exportOwlTurtle(v.source)).toBe(raw);if(c.id==='duplicates')expect(v.records[0]!.assertedQuadIndexes).toEqual([0,1]);}
});
