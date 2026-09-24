import {test,expect} from 'bun:test';
import Ajv from 'ajv/dist/2020';
import {importOwlTurtle,exportOwlTurtle,getOwlSpecialAxioms,readDocument,writeDocument,getOwlQuads,proposeOwlQuadEdit} from '../../src';
test('US-029 special axioms preserve negative polarity, lists and source through recovery and edits',async()=>{
 const raw=await Bun.file('native/owl/special-axioms.ttl').text(),doc=importOwlTurtle(raw,{id:'s',baseIRI:'https://example.org/',blankNodeScope:'scope'});
 const ajv=new Ajv({strict:false});ajv.addSchema(await Bun.file('spec/core/schema.json').json());const check=ajv.compile(await Bun.file('spec/extensions/owl/special-axioms-schema.json').json());
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format),view=getOwlSpecialAxioms(restored);expect(check(view)).toBe(true);expect(view.axioms).toHaveLength(6);expect(view.malformed).toHaveLength(3);expect(view.complete).toBe(false);expect(view.blankNodeScope).toBe('scope');expect(exportOwlTurtle(view.source)).toBe(raw);
 const neg=view.axioms[0]!;expect(neg.kind).toBe('negativePropertyAssertion');if(neg.kind!=='negativePropertyAssertion')throw Error('Expected negative assertion');expect(neg.target.value).toBe('https://example.org/carol');const qs=getOwlQuads(restored),i=qs.findIndex(q=>q.subject.value===neg.node.value&&q.predicate.value.endsWith('#targetIndividual'));const changed=proposeOwlQuadEdit(restored,i,{...qs[i]!,object:{kind:'iri',value:'https://example.org/dana'}}).document;const n=getOwlSpecialAxioms(changed).axioms[0]!;expect(n.kind==='negativePropertyAssertion'&&n.target.value).toBe('https://example.org/dana');expect(exportOwlTurtle(restored)).toBe(raw);expect(getOwlQuads(changed).filter(q=>q.predicate.value==='https://example.org/knows')).toHaveLength(1);
 }
});
test('US-029 malformed term roles reject; inverse object properties remain explicit',()=>{
 const p='@prefix owl: <http://www.w3.org/2002/07/owl#> . ';
 for(const [body,valid] of [
 ['[] a owl:NegativePropertyAssertion ; owl:sourceIndividual <urn:a> ; owl:assertionProperty [owl:inverseOf <urn:p>] ; owl:targetIndividual <urn:b> .',true],
 ['[] a owl:NegativePropertyAssertion ; owl:sourceIndividual <urn:a> ; owl:assertionProperty <urn:p> ; owl:targetValue <urn:b> .',false],
 ['[] a owl:AllDifferent ; owl:members (<urn:a> "bad") .',false],
 ['[] a owl:AllDifferent ; owl:members (<urn:a>) .',false],
 ] as const){const doc=importOwlTurtle(p+body,{id:'s',baseIRI:'urn:base:'}),v=getOwlSpecialAxioms(doc);expect(v.axioms.length).toBe(valid?1:0);expect(v.malformed.length).toBe(valid?0:1);expect(exportOwlTurtle(v.source)).toBe(p+body);}
});
