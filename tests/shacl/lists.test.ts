import {test,expect} from 'bun:test';
import {importShaclTurtle,importRdfTurtle,proposeShaclEngineValidation,exportShaclTurtle,readDocument,writeDocument} from '../../src';
const prefix='@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> . ';
test('US-028 malformed Core constraint lists never produce a conformance result',async()=>{
 const tails=['','<urn:list> rdf:first 1 .','<urn:list> rdf:rest rdf:nil .','<urn:list> rdf:first 1,2 ; rdf:rest rdf:nil .','<urn:list> rdf:first 1 ; rdf:rest rdf:nil,<urn:other> .','<urn:list> rdf:first 1 ; rdf:rest "bad" .','<urn:list> rdf:first 1 ; rdf:rest <urn:list> .','<urn:list> rdf:first 1 ; rdf:rest rdf:nil . rdf:nil rdf:first 2 .'];
 for(const property of ['in','languageIn','ignoredProperties','and','or','xone'])for(const tail of tails){
 const raw=prefix+'<urn:s> sh:targetNode <urn:a> ; sh:'+property+' <urn:list> . '+tail,shapes=importShaclTurtle(raw,{id:'s',baseIRI:'urn:base:'}),data=importRdfTurtle('',{id:'d',baseIRI:'urn:base:'});
 const r=await proposeShaclEngineValidation(readDocument(writeDocument(shapes,'json'),'json'),data,{id:'r',blankNodePolicy:'disjoint-inputs'});
 expect(r.status).toBe('blocked');expect(r.report).toBeUndefined();expect(r.engineConforms).toBeUndefined();expect(exportShaclTurtle(r.shapes)).toBe(raw);
 }
},60000);
test('US-028 empty, named, shared and duplicate-triple lists retain RDF set semantics',async()=>{
 for(const body of ['sh:in ()','sh:in <urn:l> . <urn:l> rdf:first <urn:a> ; rdf:rest rdf:nil','sh:in <urn:l> ; sh:or <urn:l> . <urn:l> rdf:first <urn:a> ; rdf:rest rdf:nil . <urn:l> rdf:first <urn:a>']){
 const raw=prefix+'<urn:s> sh:targetNode <urn:a> ; '+body+' .',shapes=importShaclTurtle(raw,{id:'s',baseIRI:'urn:base:'}),data=importRdfTurtle('',{id:'d',baseIRI:'urn:base:'});
 const r=await proposeShaclEngineValidation(shapes,data,{id:'r',blankNodePolicy:'disjoint-inputs'});expect(r.status).toBe('evaluated');expect(r.engineConforms).toBe(!body.includes('()'));expect(exportShaclTurtle(r.shapes)).toBe(raw);
 }
});
