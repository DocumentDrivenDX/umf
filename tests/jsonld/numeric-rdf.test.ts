import {test,expect} from 'bun:test';
import {importJsonLdDocument,proposeJsonLdNodeEdit,proposeJsonLdToRdf,getJsonLdNode,getRdfQuads} from '../../src';
test('US-026-AC17: edited exact tokens remain archived while binary64 projections disclose rounding',async()=>{
 const source=importJsonLdDocument('{"@id":"urn:s","urn:p":9007199254740993}',{id:'edit',baseIRI:'https://example.org/'}),edited=proposeJsonLdNodeEdit(source,'/urn:p','9007199254740995').document;
 const report=await proposeJsonLdToRdf(edited,{id:'rounded',numericPolicy:'binary64',lossPolicy:'report'});expect(report.status).toBe('candidate');expect((getRdfQuads(report.candidate!)[0]!.object as any).value).toBe('9007199254740996');expect(getJsonLdNode(report.source,'/urn:p')).toEqual({kind:'number',value:'9007199254740995'});expect(getJsonLdNode(source,'/urn:p')).toEqual({kind:'number',value:'9007199254740993'});expect(report.diagnostics.some(d=>d.code==='JSONLD_RDF_NUMBER_LOSS'&&d.path==='/0/urn:p/0/@value')).toBe(true);
 expect((await proposeJsonLdToRdf(edited,{id:'strict',numericPolicy:'strict',lossPolicy:'report'})).status).toBe('blocked');expect((await proposeJsonLdToRdf(edited,{id:'reject',numericPolicy:'binary64',lossPolicy:'reject'})).status).toBe('blocked');
});
test('US-026-AC17: independent native numeric outcomes are qualified rather than coerced into agreement',async()=>{
 const rows=(await Bun.file('fixtures/jsonld/to-rdf/numeric-oracle-results.json').json()).results;expect(rows).toHaveLength(16);expect(rows.filter((r:any)=>r.native==='rejected').map((r:any)=>r.id)).toEqual(['typed-double-precision','double-string','double-nonfinite']);expect(rows.filter((r:any)=>r.expectedValuesEqual===false).map((r:any)=>r.id)).toEqual(['binary-integer','binary-underflow','strict-small','binary-large-integer']);
});
test('US-026-AC17: numeric lexical forms retain their intended RDF datatypes',async()=>{
 const cases=(await Bun.file('fixtures/jsonld/to-rdf/authored/results.json').json()).results,types:Record<string,string>={'binary-integer':'integer','binary-zero':'integer','binary-underflow':'integer','binary-large-integer':'integer','strict-small':'double','binary-small-rounding':'double','binary-forced-double':'double','typed-double-precision':'double','double-string':'double','double-nonfinite':'double'};
 for(const c of cases){if(!types[c.id]&&c.id!=='binary-json')continue;const r=await proposeJsonLdToRdf(importJsonLdDocument(c.source,c.inputs),c.options);expect(r.status).toBe('candidate');for(const q of getRdfQuads(r.candidate!)){expect(q.object.kind).toBe('literal');expect((q.object as any).datatype).toBe(c.id==='binary-json'?'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON':'http://www.w3.org/2001/XMLSchema#'+types[c.id]);}}
});
