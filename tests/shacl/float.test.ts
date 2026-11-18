// SPDX-License-Identifier: MIT OR Apache-2.0
// @test-exclusive
import {verifyShaclCorpus} from './corpus-workers';
import {test,expect} from 'bun:test';
import {importShaclTurtle,importRdfTurtle,proposeShaclEngineValidation,readDocument,writeDocument,getRdfQuads,exportShaclTurtle,exportRdfTurtle} from '../../src/index-node-v4';
test('US-028 mixed numeric promotions agree with direct native C conversions',async()=>{
 const oracle=await Bun.file('fixtures/shacl/float-oracle.json').json(),matrix=await Bun.file('fixtures/shacl/float-results.json').json();expect(oracle.results).toHaveLength(24);expect(oracle.results.every((r:any)=>r.equal)).toBe(true);expect(matrix.cases).toHaveLength(160);
 await verifyShaclCorpus('float',matrix.cases);
},120000);
test('US-028 conversion limit blocks without a partial report or source loss',async()=>{
 const lexical='1.'+'1'.repeat(10001),raw='<urn:s> <http://www.w3.org/ns/shacl#targetNode> <urn:a> ; <http://www.w3.org/ns/shacl#property> [ <http://www.w3.org/ns/shacl#path> <urn:p> ; <http://www.w3.org/ns/shacl#minInclusive> "0"^^<http://www.w3.org/2001/XMLSchema#float> ] .',shapes=importShaclTurtle(raw,{id:'s',baseIRI:'urn:base:'}),data=importRdfTurtle('<urn:a> <urn:p> "'+lexical+'"^^<http://www.w3.org/2001/XMLSchema#float> .',{id:'d',baseIRI:'urn:base:'}),r=await proposeShaclEngineValidation(shapes,data,{id:'r',blankNodePolicy:'disjoint-inputs'});expect(r.status).toBe('blocked');expect(r.engineConforms).toBeUndefined();expect(r.report).toBeUndefined();expect(exportShaclTurtle(r.shapes)).toBe(raw);expect(r.diagnostics.at(-1)!.message).toContain('10,000');
});
