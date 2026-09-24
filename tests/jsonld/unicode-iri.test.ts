import {test,expect} from 'bun:test';
import {importJsonLdDocument,proposeJsonLdToRdf,proposeJsonLdExpansion,proposeJsonLdFlatten,proposeJsonLdCompaction,proposeJsonLdFraming,getRdfQuads} from '../../src';
const ordered=(quads:unknown[])=>quads.map(q=>JSON.stringify(q)).sort();
test('US-026-AC16: Unicode IRIs retain their spelling across processing and selected framing',async()=>{
 const cases=(await Bun.file('native/jsonld/examples/to-rdf-cases.json').json()).filter((c:any)=>c.id.startsWith('unicode-'));expect(cases).toHaveLength(4);
 for(const c of cases){const d=importJsonLdDocument(c.source,{id:c.id,baseIRI:'https://example.org/'}),native=JSON.parse(c.source),base=await proposeJsonLdToRdf(d,c.options);expect(base.status).toBe('candidate');const expected=getRdfQuads(base.candidate!);
 const reports=[await proposeJsonLdExpansion(d,{lossPolicy:'reject'}),await proposeJsonLdFlatten(d,{lossPolicy:'reject'}),await proposeJsonLdCompaction(d,{lossPolicy:'reject',context:JSON.stringify(native['@context'])}),await proposeJsonLdFraming(d,{lossPolicy:'reject',frame:JSON.stringify({'@id':native['@graph'][0]['@id']})})];
 for(const [index,r] of reports.entries()){expect(r.status).toBe('candidate');expect(r.diagnostics.some(d=>d.code==='JSONLD_EVENT')).toBe(false);const projected=await proposeJsonLdToRdf(r.candidate!,c.options);expect(projected.status).toBe('candidate');expect(ordered(getRdfQuads(projected.candidate!))).toEqual(ordered(index===3?expected.map(q=>({...q,graph:{kind:'default'}})):expected));}
 }
});
test('US-026-AC16: independent parser limitations and escaped term evidence remain explicit',async()=>{
 const rows=(await Bun.file('fixtures/jsonld/to-rdf/unicode-iri-oracle-results.json').json()).results;expect(rows).toHaveLength(4);for(const row of rows){expect(row.native).toBe('rejected');expect(row.expectedComparisons).toHaveLength(2);for(const e of row.expectedComparisons){expect(e.rawError).toBeString();expect(e.escapedTermsEqual).toBe(true);}}
 const resolution=await Bun.file('fixtures/jsonld/to-rdf/unicode-iri-resolution.json').json();expect(resolution.resolved).toBe(true);expect(resolution.output).toBe(resolution.expected);expect(resolution.report.status).toBe('candidate');
});
