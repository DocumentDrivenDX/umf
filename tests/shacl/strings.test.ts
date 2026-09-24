import {test,expect} from 'bun:test';
import {importShaclTurtle,importRdfTurtle,proposeShaclEngineValidation,readDocument,writeDocument,getRdfQuads,exportShaclTurtle,exportRdfTurtle} from '../../src';
test('US-028 string constraints preserve lexical values and Unicode semantics',async()=>{
 const oracle=await Bun.file('fixtures/shacl/string-oracle.json').json(),matrix=await Bun.file('fixtures/shacl/string-results.json').json();expect(oracle.results).toHaveLength(106);expect(oracle.results.filter((r:any)=>r.equal)).toHaveLength(100);expect(matrix.cases).toHaveLength(106);
 for(const c of matrix.cases){const raw=await Bun.file(c.shapesPath).text(),dataRaw=await Bun.file(c.dataPath).text(),shapes=importShaclTurtle(raw,{id:'s',baseIRI:'https://example.org/'}),data=importRdfTurtle(dataRaw,{id:'d',baseIRI:'https://example.org/'});const format=c.id.endsWith('Exclusive')?'yaml':'json',r=await proposeShaclEngineValidation(readDocument(writeDocument(shapes,format),format),readDocument(writeDocument(data,format),format),{id:'r',blankNodePolicy:'disjoint-inputs'});expect(r.status).toBe('evaluated');expect(r.engineConforms).toBe(c.expected);expect(r.stringProfile).toBe('umf-string-1');expect(exportShaclTurtle(r.shapes)).toBe(raw);expect(exportRdfTurtle(r.data)).toBe(dataRaw);expect(getRdfQuads(r.report!).filter(q=>q.predicate.value.endsWith('#result')).length).toBe(c.expected?0:1);}
},60000);
test('US-028 malformed string parameters block without source loss',async()=>{
 for(const parameter of ['<http://www.w3.org/ns/shacl#minLength> -1','<http://www.w3.org/ns/shacl#maxLength> "2"','<http://www.w3.org/ns/shacl#languageIn> ("en_XX")']){
 const raw='<urn:s> <http://www.w3.org/ns/shacl#targetNode> "a"@en ; '+parameter+' .',shapes=importShaclTurtle(raw,{id:'s',baseIRI:'urn:base:'}),data=importRdfTurtle('',{id:'d',baseIRI:'urn:base:'}),r=await proposeShaclEngineValidation(shapes,data,{id:'r',blankNodePolicy:'disjoint-inputs'});
 expect(r.status).toBe('blocked');expect(r.report).toBeUndefined();expect(r.engineConforms).toBeUndefined();expect(exportShaclTurtle(r.shapes)).toBe(raw);
 }
});
