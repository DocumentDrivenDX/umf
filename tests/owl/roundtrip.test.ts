import {test,expect} from 'bun:test';
import Ajv from 'ajv/dist/2020';
import {importOwlTurtle,exportOwlTurtle,getOwlQuads,getOwlOntologyHeaders,proposeOwlQuadEdit,inspectOwlDocument,writeDocument,readDocument} from '../../src';
test('US-029 OWL graph recovery, ontology headers and native graph oracle',async()=>{
 const ajv=new Ajv({strict:false}),check=ajv.compile(await Bun.file('spec/extensions/owl/headers-schema.json').json());
 const oracle=await Bun.file('fixtures/owl/oracle-results.json').json();expect(oracle.results).toHaveLength(4);expect(oracle.results.every((r:any)=>r.isomorphic)).toBe(true);
 for(const name of ['primer-corrected','authored']){const raw=await Bun.file('native/owl/'+name+'.ttl').text(),doc=importOwlTurtle(raw,{id:name,baseIRI:'https://example.org/',blankNodeScope:name});for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(exportOwlTurtle(restored)).toBe(raw);expect(inspectOwlDocument(restored).valid).toBe(true);expect(inspectOwlDocument(restored).complete).toBe(false);const headers=getOwlOntologyHeaders(restored);expect(check(headers)).toBe(true);expect(headers).toHaveLength(1);expect(headers[0]!.imports).toHaveLength(1);headers[0]!.node.value='mutated';expect(getOwlOntologyHeaders(restored)[0]!.node.value).not.toBe('mutated');}}
 expect(()=>importOwlTurtle(awaitRaw,{id:'bad',baseIRI:'urn:base:'})).toThrow();
});
const awaitRaw=await Bun.file('native/owl/primer.ttl').text();
test('US-029 copied edits retain OWL terms and unknown envelope content atomically',async()=>{
 const raw=await Bun.file('native/owl/authored.ttl').text(),doc=importOwlTurtle(raw,{id:'s',baseIRI:'https://example.org/'});doc.future={note:'retain'};const qs=getOwlQuads(doc),i=qs.findIndex(q=>q.predicate.value.endsWith('#minQualifiedCardinality')),q=qs[i]!;expect(q.object.value).toBe('9007199254740993');q.object={...q.object,value:'9007199254740994'};const next=proposeOwlQuadEdit(doc,i,q).document;expect(next.future).toEqual(doc.future);expect(getOwlQuads(next)[i]!.object.value).toBe('9007199254740994');expect(exportOwlTurtle(doc)).toBe(raw);expect(getOwlQuads(next).filter(q=>q.predicate.value==='https://example.org/policy')).toHaveLength(1);expect(()=>proposeOwlQuadEdit(doc,i,{...q,predicate:{kind:'iri',value:'bad relative'}})).toThrow();expect(exportOwlTurtle(doc)).toBe(raw);
});
test('US-029 unknown encoding is recoverable but cannot be interpreted or exported',()=>{
 const doc=importOwlTurtle('<urn:o> a <http://www.w3.org/2002/07/owl#Ontology> .',{id:'o',baseIRI:'urn:base:'});(doc.modules[0]!.elements[0]!.extensions['umf.owl'] as any).future={meaning:'retain'};
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(restored).toEqual(doc);expect(()=>exportOwlTurtle(restored)).toThrow();expect(()=>getOwlOntologyHeaders(restored)).toThrow();}
});
test('US-029 headers remain multiple, explicit and source-scoped',()=>{
 const raw='@prefix owl: <http://www.w3.org/2002/07/owl#> . <urn:a> a owl:Ontology ; owl:imports <urn:x>,<urn:y> ; owl:versionIRI <urn:v> . _:b a owl:Ontology ; owl:imports "invalid but retained" .',doc=importOwlTurtle(raw,{id:'s',baseIRI:'urn:base:'}),headers=getOwlOntologyHeaders(doc);expect(headers).toHaveLength(2);expect(headers[0]!.imports).toHaveLength(2);expect(headers[1]!.node.kind).toBe('blank');expect(headers[1]!.imports[0]!.kind).toBe('literal');expect(getOwlOntologyHeaders(importOwlTurtle('<urn:a> a <http://www.w3.org/2002/07/owl#Class> .',{id:'s',baseIRI:'urn:base:'}))).toEqual([]);
});
