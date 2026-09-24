import {test,expect} from 'bun:test';
import Ajv from 'ajv/dist/2020';
import {importOwlTurtle,exportOwlTurtle,getOwlListAxioms,getOwlQuads,getOwlAxiomAnnotations,proposeOwlQuadEdit,readDocument,writeDocument} from '../../src';
test('US-029 list axioms preserve ordering, duplicate occurrences, annotation anchors and malformed source',async()=>{
 const raw=await Bun.file('native/owl/list-axioms.ttl').text(),doc=importOwlTurtle(raw,{id:'lists',baseIRI:'https://example.org/',blankNodeScope:'list-scope'});
 const ajv=new Ajv({strict:false});ajv.addSchema(await Bun.file('spec/core/schema.json').json());const check=ajv.compile(await Bun.file('spec/extensions/owl/list-axioms-schema.json').json());
 for(const format of ['json','yaml'] as const){
  const d=readDocument(writeDocument(doc,format),format),v=getOwlListAxioms(d);expect(check(v)).toBe(true);expect(v.axioms).toHaveLength(6);expect(v.malformed).toHaveLength(8);expect(v.complete).toBe(false);expect(v.blankNodeScope).toBe('list-scope');expect(exportOwlTurtle(v.source)).toBe(raw);
  const chain=v.axioms[0]!;expect(chain.kind).toBe('propertyChain');expect(chain.members.map(t=>t.value)).toEqual(['https://example.org/parent','https://example.org/ancestor']);expect(chain.quadIndexes).toHaveLength(2);expect(chain.listQuadIndexes).toHaveLength(5);expect(getOwlAxiomAnnotations(v.source,chain.quadIndexes[0]!).roots).toHaveLength(1);
  expect(v.axioms[1]!.members.map(t=>t.value)).toEqual(['https://example.org/parent','https://example.org/parent']);expect(v.axioms[2]!.members[0]!.kind).toBe('blank');expect(v.axioms.filter(a=>a.kind==='key')).toHaveLength(2);
  const qs=getOwlQuads(d);for(const a of v.axioms){for(const i of a.quadIndexes)expect(qs[i]!.subject).toEqual(a.node);for(const i of a.listQuadIndexes)expect(['http://www.w3.org/1999/02/22-rdf-syntax-ns#first','http://www.w3.org/1999/02/22-rdf-syntax-ns#rest']).toContain(qs[i]!.predicate.value);}
  const i=chain.listQuadIndexes.find(i=>qs[i]!.object.kind==='iri'&&qs[i]!.object.value==='https://example.org/ancestor')!;
  const edited=proposeOwlQuadEdit(d,i,{...qs[i]!,object:{kind:'iri',value:'https://example.org/guardian'}}).document;expect(getOwlListAxioms(edited).axioms[0]!.members.map(t=>t.value)).toEqual(['https://example.org/parent','https://example.org/guardian']);expect(exportOwlTurtle(d)).toBe(raw);
  v.axioms[0]!.members[0]!.value='urn:mutated';expect(getOwlListAxioms(d).axioms[0]!.members[0]!.value).toBe('https://example.org/parent');
 }
});
test('US-029 list axiom recovery and edits match independent local-structure comparisons',async()=>{
 const cases=(await Bun.file('fixtures/owl/list-axioms.json').json()).cases,oracle=(await Bun.file('fixtures/owl/list-axioms-oracle.json').json()).cases;expect(cases).toHaveLength(12);expect(oracle).toHaveLength(12);
 for(const [i,c] of cases.entries()){
  const original=importOwlTurtle(c.input,{id:c.file,baseIRI:'https://example.org/',blankNodeScope:'lists'}),qs=getOwlQuads(original),d=c.editIndex===null?original:proposeOwlQuadEdit(original,c.editIndex,{...qs[c.editIndex]!,object:{kind:'iri',value:'https://example.org/EditedMember'}}).document;
  const v=getOwlListAxioms(readDocument(writeDocument(d,c.format),c.format));expect(v).toEqual(c.view);expect(exportOwlTurtle(v.source)).toBe(c.text);expect(oracle[i].agrees).toBe(true);expect(oracle[i].editObserved).toBe(true);
  const term=(t:any)=>t.kind==='iri'?t.value:'_:resource';expect(v.axioms.map(a=>[term(a.node),a.kind,a.members.map(term)]).sort()).toEqual(oracle[i].expected);expect(v.malformed.map(a=>[term(a.node),a.kind]).sort()).toEqual(oracle[i].invalid);
 }
},20000);
test('US-029 damaged nil and literal list tails cannot expose partial axioms',()=>{
 const p='@prefix owl:<http://www.w3.org/2002/07/owl#>. @prefix rdf:<http://www.w3.org/1999/02/22-rdf-syntax-ns#>. ';
 for(const body of ['<urn:c> owl:hasKey (<urn:p>). rdf:nil rdf:first <urn:q>.','<urn:c> owl:hasKey [rdf:first <urn:p>;rdf:rest "tail"].']){const d=importOwlTurtle(p+body,{id:'bad',baseIRI:'urn:base:'}),v=getOwlListAxioms(d);expect(v.axioms).toHaveLength(0);expect(v.malformed).toHaveLength(1);expect(exportOwlTurtle(v.source)).toBe(p+body);}
});
