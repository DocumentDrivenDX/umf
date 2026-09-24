import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importRdfNQuads,exportRdfNQuads,getRdfQuads,proposeRdfQuadEdit,inspectRdfDocument,readDocument,writeDocument} from '../../src';
const base='fixtures/rdf/nquads/';
test('US-025-AC1/3: complete official syntax corpus, native graph evidence and candidate round trips',async()=>{
 const fixture=await Bun.file(base+'results.json').json(),oracle=await Bun.file(base+'oracle-results.json').json(),manifest=await Bun.file('native/rdf/sources/manifest.json').json();expect(manifest.cases).toHaveLength(87);expect(fixture.results).toHaveLength(88);expect(oracle.results.filter((r:any)=>r.native==='accepted-negative')).toHaveLength(9);let accepted=0,edits=0;
 for(const c of fixture.results){const raw=await Bun.file(c.path).text();if(c.type!=='authored')expect(createHash('sha256').update(raw).digest('hex')).toBe(manifest.files.find((f:any)=>f.path===c.path).sha256);if(!c.positive){expect(()=>importRdfNQuads(raw,{id:c.id})).toThrow();continue;}
  const d=importRdfNQuads(raw,{id:c.id}),native=oracle.results.find((r:any)=>r.id===c.id);expect(native.datasetIsomorphic).toBe(true);expect(getRdfQuads(d)).toEqual(c.terms);expect(inspectRdfDocument(d).valid).toBe(true);expect(inspectRdfDocument(d).complete).toBe(false);accepted++;
  for(const format of ['json','yaml'] as const){expect(exportRdfNQuads(readDocument(writeDocument(d,format),format))).toBe(raw);if(c.editIndex>=0){const q=getRdfQuads(d)[c.editIndex]!,candidate=proposeRdfQuadEdit(d,c.editIndex,{...q,object:{kind:'literal',value:'UMF reviewed literal',datatype:'http://www.w3.org/2001/XMLSchema#string'}}).document;expect(exportRdfNQuads(readDocument(writeDocument(candidate,format),format))).toBe(await Bun.file(c.exports.find((x:any)=>x.format===format).path).text());expect(native.edits).toContain(format);edits++;}}
 }
 expect(accepted).toBe(54);expect(edits).toBe(76);
},30000);
test('US-025-AC2: blank scope, lexical numbers, duplicates, unknown encoding and atomic edits',async()=>{
 const raw=await Bun.file('native/rdf/examples/schema.nq').text(),d=importRdfNQuads(raw,{id:'schema'}),quads=getRdfQuads(d);expect(quads).toHaveLength(11);expect(quads[1]).toEqual(quads[2]);expect(quads[8]!.object).toEqual({kind:'literal',value:'001.2300',datatype:'http://www.w3.org/2001/XMLSchema#decimal'});expect(quads[9]!.object).toEqual({kind:'literal',value:'18446744073709551615',datatype:'http://www.w3.org/2001/XMLSchema#integer'});quads[0]!.predicate.value='changed';expect(exportRdfNQuads(d)).toBe(raw);
 expect(()=>proposeRdfQuadEdit(d,99,quads[0]!)).toThrow();expect(()=>proposeRdfQuadEdit(d,0,{...quads[0]!,predicate:{kind:'iri',value:'relative'}})).toThrow();expect(exportRdfNQuads(d)).toBe(raw);
 const unknown=structuredClone(d);(unknown.modules[0]!.elements[0]!.extensions['umf.rdf'] as any).future={meaning:'retained'};expect(inspectRdfDocument(unknown).valid).toBe(true);expect(readDocument(writeDocument(unknown,'yaml'),'yaml')).toEqual(unknown);expect(()=>exportRdfNQuads(unknown)).toThrow();
 for(const text of ['VERSION "1.2"\n','<urn:s> <urn:p> "x"@en--ltr .','<urn:s> <urn:p> <<( <urn:a> <urn:b> <urn:c> )>> .'])expect(()=>importRdfNQuads(text,{id:'future'})).toThrow();
});

test('US-025-AC2: invalid Unicode cannot silently change during UTF-8 export',()=>{
 for(const code of [0xd800,0xdc00])expect(()=>importRdfNQuads('<urn:s> <urn:p> "'+String.fromCharCode(code)+'" .',{id:'unicode'})).toThrow();
 const text='<urn:s> <urn:p> "🙂" .';expect(exportRdfNQuads(importRdfNQuads(text,{id:'unicode'}))).toBe(text);
});
