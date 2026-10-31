// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {UmfError,rdfRegistry,validateDocument,importRdfNQuads,getRdfQuads,proposeRdfQuadEdit,exportRdfNQuads} from '../../src/index-node-v4';

test('Node default root uses the native RDF kernel for import, edit, export and refusal',()=>{
 const source='<https://example.test/s> <https://example.test/p> "before" .\n';
 const document=importRdfNQuads(source,{id:'rdf-native-root'});
 expect(validateDocument(document,rdfRegistry()).valid).toBe(true);
 const quads=getRdfQuads(document);expect(quads).toHaveLength(1);
 const edited=proposeRdfQuadEdit(document,0,{...quads[0]!,object:{kind:'literal',value:'after',datatype:'http://www.w3.org/2001/XMLSchema#string'}});
 expect(exportRdfNQuads(edited.document)).toContain('"after"');
 expect(exportRdfNQuads(document)).toBe(source);
 let refusal:unknown;try{importRdfNQuads('not n-quads',{id:'rdf-invalid'});}catch(error){refusal=error;}
 expect(refusal).toBeInstanceOf(UmfError);expect(refusal).toMatchObject({code:'RDF_SYNTAX'});
},60_000);
