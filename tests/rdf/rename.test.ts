import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/rdf/rename-schema.json';
import {importRdfNQuads,proposeRdfIriRename,exportRdfNQuads,getRdfQuads,readDocument,writeDocument} from '../../src';
const base='fixtures/rdf/rename/';
test('US-025-AC4: corpus IRI renames match native datasets through both UMF formats',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).cases,native=(await Bun.file(base+'oracle-results.json').json()).results,check=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema);expect(cases).toHaveLength(53);expect(native).toHaveLength(106);
 for(const c of cases){const raw=await Bun.file(c.path).text(),d=importRdfNQuads(raw,{id:c.id});for(const row of c.exports){const restored=readDocument(writeDocument(d,row.format),row.format),r=proposeRdfIriRename(restored,{from:c.from,to:c.to});expect(r.status).toBe('candidate');expect(check(r)).toBe(true);expect(r.changes).toEqual(row.changes);expect(exportRdfNQuads(r.source)).toBe(raw);expect(exportRdfNQuads(readDocument(writeDocument(r.candidate!,row.format),row.format))).toBe(await Bun.file(row.path).text());expect(native.find((n:any)=>n.id===c.id&&n.format===row.format).isomorphic).toBe(true);expect(r.complete).toBe(false);}}
},30000);
test('US-025-AC4: all term positions change while literal text, blank scope and source stay intact',async()=>{
 const raw=await Bun.file('native/rdf/examples/rename.nq').text(),d=importRdfNQuads(raw,{id:'rename',blankNodeScope:'urn:old'}),r=proposeRdfIriRename(d,{from:'urn:old',to:'urn:new'}),terms=getRdfQuads(r.candidate!);expect(r.changes).toHaveLength(9);expect(terms[0]).toEqual(terms[1]);expect(terms[2]!.object).toEqual({kind:'literal',value:'urn:old',datatype:'urn:new'});expect(terms[3]!.object).toEqual({kind:'literal',value:'urn:old',datatype:'http://www.w3.org/2001/XMLSchema#string'});expect((r.candidate!.modules[0]!.elements[0]!.extensions['umf.rdf'] as any).blankNodeScope).toBe('urn:old');expect(exportRdfNQuads(d)).toBe(raw);expect(r.diagnostics.some(d=>d.message.includes('value interpretation'))).toBe(true);r.source.id='changed';expect(d.id).toBe('rename');
});
test('US-025-AC4: collisions, absent terms, invalid IRIs and unknown encoding block atomically',()=>{
 const raw='<urn:a> <urn:p> "x"@en <urn:g> .',d=importRdfNQuads(raw,{id:'guard'});
 for(const [from,to] of [['urn:a','urn:p'],['urn:absent','urn:new'],['urn:a','urn:a'],['urn:a','relative'],['http://www.w3.org/1999/02/22-rdf-syntax-ns#langString','urn:custom']]){const r=proposeRdfIriRename(d,{from:from!,to:to!});expect(r.status).toBe('blocked');expect(r.candidate).toBeUndefined();expect(r.changes).toEqual([]);expect(exportRdfNQuads(r.source)).toBe(raw);}
 const unknown=structuredClone(d);(unknown.modules[0]!.elements[0]!.extensions['umf.rdf'] as any).future={reference:'urn:a'};expect(proposeRdfIriRename(unknown,{from:'urn:a',to:'urn:new'}).status).toBe('blocked');expect(exportRdfNQuads(d)).toBe(raw);expect(()=>proposeRdfIriRename(d,{from:'',to:'urn:new'})).toThrow();
});
