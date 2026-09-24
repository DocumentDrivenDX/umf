import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import reportSchema from '../../spec/extensions/linkml/import-report-schema.json';
import {inspectLinkmlImportContext,exportLinkmlDocument,type LinkmlImportContext} from '../../src';
const fixture=await Bun.file('fixtures/linkml/imports/results.json').json();
const context=(id:string):LinkmlImportContext=>structuredClone(fixture.cases.find((c:any)=>c.id===id).context);
test('US-024-AC5: report schema, exact supplied sources and native reachable sets',async()=>{
 const check=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(reportSchema);
 const oracle=await Bun.file('fixtures/linkml/imports/oracle-results.json').json();
 for(const c of fixture.cases){for(const row of c.reports){const report=inspectLinkmlImportContext(row.report.context);expect(report).toEqual(row.report);expect(check(report)).toBe(true);expect(report.complete).toBe(false);for(const s of report.context.schemas)expect(exportLinkmlDocument(s.document)).toBe(c.sources.find((x:any)=>x.key===s.key).text);const native=oracle.results.find((x:any)=>x.id===c.id);if(native.comparison==='reachable-set')expect([...report.nodes].sort()).toEqual([...native.nativeClosure].sort());}}
});
test('US-024-AC5: source ordering, repeated edges, cycles and importer-scoped aliases',()=>{
 const diamond=inspectLinkmlImportContext(context('diamond'));expect(diamond.nodes).toEqual(['root','left','right','shared']);expect(diamond.context.schemas.map(s=>s.key)).toContain('unused');
 const cycle=inspectLinkmlImportContext(context('cycle-repeat'));expect(cycle.status).toBe('resolved');expect(cycle.edges.map(e=>[e.from,e.target,e.path])).toEqual([['root','left','/imports/0'],['root','left','/imports/1'],['left','root','/imports/0']]);
 const scoped=inspectLinkmlImportContext(context('scoped'));expect(scoped.edges.filter(e=>e.import==='common').map(e=>e.target)).toEqual(['a','b']);
 const missing=inspectLinkmlImportContext(context('missing'));expect(missing.status).toBe('blocked');expect(missing.edges).toEqual([{from:'root',import:'missing',path:'/imports/0'}]);
});
test('US-024-AC5: bad contexts cannot silently resolve; caller inputs remain isolated',()=>{
 const d=context('diamond');const report=inspectLinkmlImportContext(d);report.context.schemas[0]!.key='changed';expect(d.schemas[0]!.key).toBe('root');
 for(const mutate of [
  (c:LinkmlImportContext)=>c.schemas.push(c.schemas[0]!),
  (c:LinkmlImportContext)=>c.bindings.push(c.bindings[0]!),
  (c:LinkmlImportContext)=>{c.bindings[0]!.target='absent';},
  (c:LinkmlImportContext)=>{c.entry='absent';},
  (c:LinkmlImportContext)=>{c.schemas.at(-1)!.document={} as any;},
  (c:LinkmlImportContext)=>{(c.schemas[0]!.document.modules[0]!.elements[0]!.extensions['umf.linkml'] as any).metamodelVersion='future';}
 ]){const c=context('diamond');mutate(c);const before=structuredClone(c);expect(inspectLinkmlImportContext(c).status).toBe('blocked');expect(c).toEqual(before);}
 expect(()=>inspectLinkmlImportContext({...d,schemas:[]})).toThrow();
});
