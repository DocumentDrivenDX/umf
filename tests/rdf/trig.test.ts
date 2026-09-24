import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importRdfTriG,exportRdfTriG,exportRdfNQuads,importRdfNQuads,getRdfNamedGraphs,getRdfQuads,proposeRdfQuadEdit,proposeRdfIriRename,readDocument,writeDocument} from '../../src';
const base='fixtures/rdf/trig/';
test('US-025-AC6: full official TriG corpus, expected graphs and candidate exports',async()=>{
 const fixture=await Bun.file(base+'results.json').json(),oracle=await Bun.file(base+'oracle-results.json').json(),manifest=await Bun.file('native/rdf/trig-sources/manifest.json').json();expect(fixture.results.filter((c:any)=>c.id!=='authored-empty').map((c:any)=>c.id)).toEqual(manifest.cases.map((c:any)=>c.id));expect(fixture.results).toHaveLength(358);expect(oracle.results.filter((r:any)=>r.officialExpectedQuads)).toHaveLength(143);let accepted=0,edits=0;
 for(const c of fixture.results){const raw=await Bun.file(c.path).text();if(c.id!=='authored-empty')expect(createHash('sha256').update(raw).digest('hex')).toBe(manifest.files.find((f:any)=>f.path===c.path).sha256);if(!c.positive){expect(()=>importRdfTriG(raw,{id:c.id,baseIRI:c.baseIRI})).toThrow();continue;}
  const d=importRdfTriG(raw,{id:c.id,baseIRI:c.baseIRI}),native=oracle.results.find((r:any)=>r.id===c.id);expect(native.graphInventoryIsomorphic).toBe(true);expect(getRdfQuads(d)).toEqual(c.terms);expect(getRdfNamedGraphs(d)).toEqual(c.namedGraphs);if(c.nquadsPath)expect(exportRdfNQuads(d)).toBe(await Bun.file(c.nquadsPath).text());else expect(()=>exportRdfNQuads(d)).toThrow('empty named graphs');accepted++;
  for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);expect(exportRdfTriG(restored)).toBe(raw);if(c.editIndex>=0){const q=getRdfQuads(d)[c.editIndex]!,r=proposeRdfQuadEdit(restored,c.editIndex,{...q,object:{kind:'literal',value:'UMF reviewed literal',datatype:'http://www.w3.org/2001/XMLSchema#string'}});expect(exportRdfTriG(readDocument(writeDocument(r.document,format),format))).toBe(await Bun.file(c.exports.find((e:any)=>e.format===format).path).text());expect(native.edits).toContain(format);edits++;}}
 }
 expect(accepted).toBe(243);expect(edits).toBe(216);
},120000);
test('US-025-AC6: empty graph identity survives edits and guarded IRI renames',async()=>{
 const raw=await Bun.file('native/rdf/examples/empty-graphs.trig').text(),d=importRdfTriG(raw,{id:'empty',baseIRI:'https://example.org/'});
 expect(getRdfNamedGraphs(d)).toHaveLength(3);const blank=getRdfNamedGraphs(d).find(g=>g.kind==='blank')!;expect(getRdfQuads(d).every(q=>q.subject.value===blank.value)).toBe(true);
 for(const format of ['json','yaml'] as const){const r=proposeRdfIriRename(d,{from:'urn:example:empty',to:'urn:example:renamed'});expect(r.status).toBe('candidate');expect(r.changes.map(c=>c.path)).toEqual(['/namedGraphs/0/value']);expect(exportRdfTriG(readDocument(writeDocument(r.candidate!,format),format))).toBe(await Bun.file('fixtures/rdf/trig/authored-empty.'+format+'.renamed.trig').text());expect(exportRdfTriG(r.source)).toBe(raw);}
 const collision=proposeRdfIriRename(d,{from:'urn:example:populated',to:'urn:example:empty'});expect(collision.status).toBe('blocked');expect(collision.changes).toEqual([]);expect(collision.candidate).toBeUndefined();
 const unknown=readDocument(writeDocument(d,'json'),'json');(unknown.modules[0]!.elements[0]!.extensions['umf.rdf'] as any).namedGraphs[0].future=true;expect(()=>exportRdfTriG(unknown)).toThrow('Unknown encoding');expect((readDocument(writeDocument(unknown,'yaml'),'yaml').modules[0]!.elements[0]!.extensions['umf.rdf'] as any).namedGraphs[0].future).toBe(true);
});
test('US-025-AC6: graph declarations include empty anonymous graphs and reject loss',()=>{
 const d=importRdfTriG('[] {} GRAPH [] {} <urn:g> {} <urn:g> {} {}',{id:'anonymous',baseIRI:'https://example.org/'});expect(getRdfNamedGraphs(d)).toHaveLength(3);expect(getRdfQuads(d)).toEqual([]);expect(()=>exportRdfNQuads(d)).toThrow('empty named graphs');
 const renamed=proposeRdfIriRename(d,{from:'urn:g',to:'urn:h'});expect(renamed.status).toBe('candidate');const restored=importRdfTriG(exportRdfTriG(renamed.candidate!),{id:'restored',baseIRI:'https://example.org/'});expect(getRdfNamedGraphs(restored)).toHaveLength(3);
});
