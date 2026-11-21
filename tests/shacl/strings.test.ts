// SPDX-License-Identifier: MIT OR Apache-2.0
// @test-exclusive
import {verifyShaclCorpus} from './corpus-workers';
import {test,expect} from 'bun:test';
import {importShaclTurtle,importRdfTurtle,proposeShaclEngineValidation,readDocument,writeDocument,getRdfQuads,exportShaclTurtle,exportRdfTurtle} from '../../src/index-node-v4';
test('US-028 string constraints preserve lexical values and Unicode semantics',async()=>{
 const oracle=await Bun.file('fixtures/shacl/string-oracle.json').json(),matrix=await Bun.file('fixtures/shacl/string-results.json').json();expect(oracle.results).toHaveLength(106);expect(oracle.results.filter((r:any)=>r.equal)).toHaveLength(100);expect(matrix.cases).toHaveLength(106);
 await verifyShaclCorpus('strings',matrix.cases);
},60000);
test('US-028 malformed string parameters block without source loss',async()=>{
 for(const parameter of ['<http://www.w3.org/ns/shacl#minLength> -1','<http://www.w3.org/ns/shacl#maxLength> "2"','<http://www.w3.org/ns/shacl#languageIn> ("en_XX")']){
 const raw='<urn:s> <http://www.w3.org/ns/shacl#targetNode> "a"@en ; '+parameter+' .',shapes=importShaclTurtle(raw,{id:'s',baseIRI:'urn:base:'}),data=importRdfTurtle('',{id:'d',baseIRI:'urn:base:'}),r=await proposeShaclEngineValidation(shapes,data,{id:'r',blankNodePolicy:'disjoint-inputs'});
 expect(r.status).toBe('blocked');expect(r.report).toBeUndefined();expect(r.engineConforms).toBeUndefined();expect(exportShaclTurtle(r.shapes)).toBe(raw);
 }
});
