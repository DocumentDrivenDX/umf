import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/rdf/merge-schema.json';
import {importRdfNQuads,importRdfTurtle,importRdfTriG,exportRdfTriG,exportRdfNQuads,getRdfQuads,getRdfNamedGraphs,proposeRdfDatasetMerge,readDocument,writeDocument} from '../../src';
const options={id:'merged',graphPolicy:'union-by-name',blankNodePolicy:'disjoint-inputs'} as const;
const check=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema);
test('US-025-AC7: all positive RDF source datasets merge with independent blank scopes',async()=>{
 const fixture=await Bun.file('fixtures/rdf/merge/results.json').json(),oracle=await Bun.file('fixtures/rdf/merge/oracle-results.json').json(),anchor=importRdfTriG(await Bun.file('native/rdf/examples/empty-graphs.trig').text(),{id:'same-id',baseIRI:'https://example.org/schema.trig'});expect(fixture.cases).toHaveLength(516);expect(oracle.results).toHaveLength(1032);
 for(const profile of ['nquads','turtle','trig']){const original=(await Bun.file('fixtures/rdf/'+profile+'/results.json').json()).results.filter((c:any)=>c.positive);expect(fixture.cases.filter((c:any)=>c.profile===profile).map((c:any)=>c.id)).toEqual(original.map((c:any)=>profile+'-'+c.id));}
 for(const c of fixture.cases){const raw=await Bun.file(c.inputPath).text(),o={id:'same-id',baseIRI:c.baseIRI},d=c.profile==='nquads'?importRdfNQuads(raw,o):c.profile==='turtle'?importRdfTurtle(raw,o):importRdfTriG(raw,o),r=proposeRdfDatasetMerge([d,anchor],{...options,id:c.id});expect(check(r)).toBe(true);expect(r.status).toBe('candidate');expect(r.sources).toEqual([d,anchor]);expect(r.blankNodes).toEqual(c.blankNodes);expect(r.quadOrigins).toEqual(c.quadOrigins);expect(getRdfQuads(r.candidate!)).toHaveLength(getRdfQuads(d).length+getRdfQuads(anchor).length);
 for(const e of c.exports){expect(exportRdfTriG(readDocument(writeDocument(r.candidate!,e.format),e.format))).toBe(await Bun.file(e.path).text());expect(oracle.results.find((n:any)=>n.id===c.id&&n.format===e.format).isomorphic).toBe(true);}}
},180000);
test('US-025-AC7: shared labels remain linked within each input, never across inputs',()=>{
 const d=importRdfTriG('_:b {} <urn:g> { _:b <urn:p> _:b . _:b <urn:p> _:b . }',{id:'same',blankNodeScope:'same',baseIRI:'urn:base:'});const r=proposeRdfDatasetMerge([d,d],options);expect(check(r)).toBe(true);expect(r.blankNodes).toHaveLength(2);expect(r.blankNodes[0]!.after).not.toBe(r.blankNodes[1]!.after);const qs=getRdfQuads(r.candidate!);expect(qs).toHaveLength(4);expect(qs[0]).toEqual(qs[1]);expect(qs[2]).toEqual(qs[3]);expect(JSON.stringify(qs[0]!.subject)).toEqual(JSON.stringify(qs[0]!.object));expect(qs[0]!.subject).not.toEqual(qs[2]!.subject);expect(getRdfNamedGraphs(r.candidate!)).toHaveLength(3);expect(()=>exportRdfNQuads(r.candidate!)).toThrow('empty named graphs');expect(r.quadOrigins.map(q=>q.input)).toEqual([0,0,1,1]);r.sources[0]!.id='changed';expect(d.id).toBe('same');
});
test('US-025-AC7: unknown encodings block atomically and other metadata remains in source reports',()=>{
 const d=importRdfNQuads('<urn:s> <urn:p> "001"^^<urn:custom> .',{id:'source'});d.future={opaque:'kept'};d.vocabularies['future']={version:'9.0.0'};d.modules[0]!.elements[0]!.extensions.future={opaque:'kept'};
 const good=proposeRdfDatasetMerge([d],options);expect(good.status).toBe('candidate');expect(good.sources[0]).toEqual(d);expect(good.candidate!.future).toBeUndefined();expect(good.diagnostics[0]!.message).toContain('unknown metadata');
 (d.modules[0]!.elements[0]!.extensions['umf.rdf'] as any).future={identity:'unknown'};const blocked=proposeRdfDatasetMerge([good.sources[0]!,d],options);expect(check(blocked)).toBe(true);expect(blocked.status).toBe('blocked');expect(blocked.candidate).toBeUndefined();expect(blocked.blankNodes).toEqual([]);expect(blocked.quadOrigins).toEqual([]);expect(blocked.sources[1]).toEqual(d);
 expect(()=>proposeRdfDatasetMerge([],options)).toThrow();expect(()=>proposeRdfDatasetMerge([d],{id:'bad'} as any)).toThrow();
});
