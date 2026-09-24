import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importRdfTurtle,exportRdfTurtle,exportRdfNQuads,importRdfNQuads,getRdfQuads,proposeRdfQuadEdit,proposeRdfIriRename,readDocument,writeDocument} from '../../src';
const base='fixtures/rdf/turtle/';
test('US-025-AC5: full official Turtle corpus, expected graphs and candidate exports',async()=>{
 const fixture=await Bun.file(base+'results.json').json(),oracle=await Bun.file(base+'oracle-results.json').json(),manifest=await Bun.file('native/rdf/turtle-sources/manifest.json').json();expect(fixture.results.map((c:any)=>c.id)).toEqual(manifest.cases.map((c:any)=>c.id));expect(fixture.results).toHaveLength(313);expect(oracle.results.filter((r:any)=>r.native==='accepted-negative')).toHaveLength(39);expect(oracle.results.filter((r:any)=>r.nativeSourceIsomorphic===false)).toHaveLength(11);expect(oracle.results.filter((r:any)=>r.officialExpectedGraph)).toHaveLength(145);let accepted=0,edits=0;
 for(const c of fixture.results){const raw=await Bun.file(c.path).text();expect(createHash('sha256').update(raw).digest('hex')).toBe(manifest.files.find((f:any)=>f.path===c.path).sha256);if(!c.positive){expect(()=>importRdfTurtle(raw,{id:c.id,baseIRI:c.baseIRI})).toThrow();continue;}
  const d=importRdfTurtle(raw,{id:c.id,baseIRI:c.baseIRI}),native=oracle.results.find((r:any)=>r.id===c.id);expect(native.datasetIsomorphic).toBe(true);expect(getRdfQuads(d)).toEqual(c.terms);expect(exportRdfNQuads(d)).toBe(await Bun.file(c.outputPath).text());accepted++;
  for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);expect(exportRdfTurtle(restored)).toBe(raw);if(c.editIndex>=0){const q=getRdfQuads(d)[c.editIndex]!,r=proposeRdfQuadEdit(restored,c.editIndex,{...q,object:{kind:'literal',value:'UMF reviewed literal',datatype:'http://www.w3.org/2001/XMLSchema#string'}});expect(exportRdfTurtle(readDocument(writeDocument(r.document,format),format))).toBe(await Bun.file(c.exports.find((e:any)=>e.format===format).path).text());expect(native.edits).toContain(format);edits++;}}
 }
 expect(accepted).toBe(219);expect(edits).toBe(204);
},120000);
test('US-025-AC5: blank allocation, explicit labels, base resolution and literal lexemes are stable',()=>{
 const raw='@prefix : <vocab/> . _:g_0 :p [ :p ( <item> _:g_0 ) ] . <item> :number +001 .',options={id:'scope',baseIRI:'https://example.org/path/source.ttl'},a=importRdfTurtle(raw,options);importRdfTurtle('[] <urn:p> [] .',options);const b=importRdfTurtle(raw,options);expect(getRdfQuads(a)).toEqual(getRdfQuads(b));expect(exportRdfTurtle(a)).toBe(raw);
 const terms=getRdfQuads(a),blanks=new Set(terms.flatMap(q=>[q.subject,q.object]).filter(t=>t.kind==='blank').map(t=>(t as {value:string}).value));expect([...blanks].some(v=>v.startsWith('e_'))).toBe(true);expect([...blanks].some(v=>v.startsWith('g_'))).toBe(true);expect([...blanks].every(v=>/^[a-z0-9_]+$/.test(v))).toBe(true);expect(terms.at(-1)!.object).toEqual({kind:'literal',value:'+001',datatype:'http://www.w3.org/2001/XMLSchema#integer'});
 const renamed=proposeRdfIriRename(a,{from:'https://example.org/path/item',to:'urn:item'});expect(renamed.status).toBe('candidate');expect(exportRdfTurtle(renamed.source)).toBe(raw);expect(exportRdfTurtle(renamed.candidate!)).toContain('<urn:item>');
});
test('US-025-AC5: named graph loss, missing base and RDF 1.2 syntax are explicit failures',()=>{
 expect(()=>exportRdfTurtle(importRdfNQuads('<urn:s> <urn:p> <urn:o> <urn:g> .',{id:'named'}))).toThrow();expect(()=>importRdfTurtle('<s> <p> <o> .',{id:'x'} as any)).toThrow();expect(()=>importRdfTurtle('<s> <p> <o> .',{id:'x',baseIRI:'relative'})).toThrow();
 for(const raw of ['VERSION "1.2"','@version "1.2" .','<urn:s> <urn:p> "x"@en--ltr .','<urn:s> <urn:p> <<( <urn:a> <urn:b> <urn:c> )>> .'])expect(()=>importRdfTurtle(raw,{id:'future',baseIRI:'https://example.org/'})).toThrow();
 const d=importRdfTurtle('<urn:s> <urn:p> <urn:o> .',{id:'x',baseIRI:'https://example.org/'}),q=getRdfQuads(d)[0]!;expect(()=>proposeRdfQuadEdit(d,0,{...q,graph:{kind:'iri',value:'urn:g'}})).toThrow();
});
