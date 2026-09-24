import {test,expect} from 'bun:test';
import {probeRdfXml,probeGraphSignature} from '../../native/rdfxml/probe';
test('SPIKE-006: literal repair preserves authored XML structure and every official graph outcome',async()=>{
 const rows=(await Bun.file('fixtures/rdfxml/literals.json').json()).results;expect(rows).toHaveLength(206);
 for(const c of rows){const r=await probeRdfXml(c.input,c.baseIRI,c.profile);expect(r.accepted).toBe(c.accepted);if(r.accepted)expect(probeGraphSignature(r.nquads!)).toBe(probeGraphSignature(c.nquads));else expect(r.nquads).toBeUndefined();}
 const oracle=await Bun.file('fixtures/rdfxml/literals-oracle.json').json();expect(oracle.summary['literal-repair'].officialGraphDisagreements).toBe(0);expect(oracle.summary['literal-repair'].acceptanceDisagreements).toBe(0);expect(oracle.summary['literal-repair'].nativeGraphDisagreements).toBe(7);
 const structure=(await Bun.file('fixtures/rdfxml/literal-structure.json').json()).results.filter((r:any)=>r.profile==='literal-repair');expect(structure).toHaveLength(14);expect(structure.every((r:any)=>r.agrees)).toBe(true);
 const ordinary=oracle.results.find((r:any)=>r.id==='ordinary-cdata'&&r.profile==='literal-repair');expect(ordinary.nativeGraphAgrees).toBe(true);
});
