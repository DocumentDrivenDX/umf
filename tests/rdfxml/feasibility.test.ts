import {test,expect} from 'bun:test';
import {probeRdfXml,probeGraphSignature} from '../../native/rdfxml/probe';

test('SPIKE-006: finalization rejects truncated XML without returning a partial graph',async()=>{
 const rows=(await Bun.file('fixtures/rdfxml/probe.json').json()).results;
 for(const id of ['empty','unclosed-root','unclosed-property']){
  const c=rows.find((r:any)=>r.id===id&&r.profile==='finalized');
  const r=await probeRdfXml(c.input,c.baseIRI,'finalized');expect(r.accepted).toBe(false);expect(r.nquads).toBeUndefined();expect(r.error).toBe(c.error);
 }
});
test('SPIKE-006: all pinned W3C sources and experimental outcomes remain reproducible',async()=>{
 const manifest=await Bun.file('native/rdfxml/sources/sources.json').json();expect(manifest.cases).toHaveLength(166);
 for(const f of manifest.files)expect(new Bun.CryptoHasher('sha256').update(await Bun.file(f.path).arrayBuffer()).digest('hex')).toBe(f.sha256);
 const rows=(await Bun.file('fixtures/rdfxml/corpus.json').json()).results;expect(rows).toHaveLength(498);
 for(const c of rows){const r=await probeRdfXml(await Bun.file(c.path).text(),c.baseIRI,c.profile);expect(r.accepted).toBe(c.positive);expect(r.accepted).toBe(c.accepted);if(r.accepted)expect(probeGraphSignature(r.nquads!)).toBe(probeGraphSignature(c.nquads));else expect(r.error).toBe(c.error);}
},20000);
test('SPIKE-006: native evidence retains XML-literal discrepancies instead of claiming conformance',async()=>{
 const report=await Bun.file('fixtures/rdfxml/oracle.json').json();
 expect(report.summary.finalized.acceptanceDisagreements).toBe(0);expect(report.summary.finalized.officialGraphDisagreements).toBe(0);
 const literal=report.results.find((r:any)=>r.id==='xml-literal'&&r.profile==='finalized');expect(literal.nativeGraphAgrees).toBe(false);expect(literal.nativeNTriples).toContain('a&amp;b');
 const language=report.results.find((r:any)=>r.id==='resource-language'&&r.profile==='finalized');expect(language.rawNativeGraphAgrees).toBe(false);expect(language.nativeGraphAgrees).toBe(true);
 expect(report.summary['literal-namespaces'].officialGraphDisagreements).toBe(2);
});
