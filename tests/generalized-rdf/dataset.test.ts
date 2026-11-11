// SPDX-License-Identifier: MIT OR Apache-2.0
import reference from '../../spec/core/semantic-type-reference.schema.json';
import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import reportSchema from '../../spec/extensions/jsonld/to-rdf-schema.json';
import reverseSchema from '../../spec/extensions/jsonld/from-generalized-schema.json';
import {importGeneralizedRdfDataset,exportGeneralizedRdfDataset,getGeneralizedRdfQuads,proposeGeneralizedRdfQuadEdit,inspectGeneralizedRdfDocument,importJsonLdDocument,proposeJsonLdToRdf,proposeGeneralizedRdfToJsonLd,exportRdfNQuads,exportJsonLdDocument,readDocument,writeDocument} from '../../src/index-node-v4';
const ajv=new Ajv2020({strict:false,validateFormats:false}).addSchema(reference).addSchema(core),forward=ajv.compile(reportSchema),reverse=ajv.compile(reverseSchema);
test('US-027-AC1–3: generalized official cases preserve predicate identity, round trips and edits',async()=>{
 const {cases}=await Bun.file('fixtures/generalized-rdf/results.json').json();
 expect(cases.map((c:{id:string})=>c.id)).toEqual(['t0118','te075']);
 for(const c of cases){
  const source=importJsonLdDocument(await Bun.file(c.path).text(),c.inputs);
  const report=await proposeJsonLdToRdf(source,c.options);
  expect(forward(report)).toBe(true);
  expect(report.source).toEqual(source);
  expect(report.status).toBe('candidate');
  expect(report.produceGeneralizedRdf).toBe(true);
  expect(report.diagnostics).toContainEqual(expect.objectContaining({code:'JSONLD_TO_RDF',severity:'warning'}));
  const candidate=report.candidate!, quads=getGeneralizedRdfQuads(candidate);
  const bytes=exportGeneralizedRdfDataset(candidate);
  expect(quads).toHaveLength(c.quadCount);
  expect(quads.some(quad=>quad.predicate.termType==='BlankNode')).toBe(true);
  expect(()=>exportRdfNQuads(candidate)).toThrow();
  for(const format of ['json','yaml'] as const){
   const restored=readDocument(writeDocument(candidate,format),format);
   expect(exportGeneralizedRdfDataset(restored)).toBe(bytes);
   const back=await proposeGeneralizedRdfToJsonLd(restored,c.backOptions);
   expect(reverse(back)).toBe(true);
   expect(back.source).toEqual(restored);
   expect(back.status).toBe('candidate');
   expect(JSON.parse(exportJsonLdDocument(back.candidate!))).toBeDefined();
  }
  const index=quads.findIndex(quad=>quad.object.termType==='Literal');
  const quad=quads[index]!;
  if(quad.object.termType!=='Literal')throw Error('Expected literal');
  const edited=proposeGeneralizedRdfQuadEdit(candidate,index,{...quad,object:{...quad.object,value:'edited'}}).document;
  expect(getGeneralizedRdfQuads(edited)[index]!.object.value).toBe('edited');
  expect(exportGeneralizedRdfDataset(candidate)).toBe(bytes);
 }
});
test('US-027-AC2: exact unknown source, scope, interpretation guards and atomic invalid edits',()=>{
 const source='[ {"subject":{"termType":"BlankNode","value":"same"},"predicate":{"termType":"BlankNode","value":"same"},"object":{"termType":"Literal","value":"9007199254740993","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#integer"}},"graph":{"termType":"NamedNode","value":"urn:g"}} ]';
 const d=importGeneralizedRdfDataset(source,{id:'a',blankNodeScope:'scope-a'}),other=importGeneralizedRdfDataset(source,{id:'b',blankNodeScope:'scope-b'});expect(d.modules[0]!.elements[0]!.extensions).not.toEqual(other.modules[0]!.elements[0]!.extensions);expect(inspectGeneralizedRdfDocument(d).valid).toBe(true);
 for(const format of ['json','yaml'] as const)expect(exportGeneralizedRdfDataset(readDocument(writeDocument(d,format),format))).toBe(source);
 const unknown=source.replace('"graph":','"future":9007199254740993123456789,"graph":'),u=importGeneralizedRdfDataset(unknown,{id:'unknown'});expect(()=>getGeneralizedRdfQuads(u)).toThrow();for(const format of ['json','yaml'] as const)expect(exportGeneralizedRdfDataset(readDocument(writeDocument(u,format),format))).toBe(unknown);
 const encoding=structuredClone(d);(encoding.modules[0]!.elements[0]!.extensions['umf.generalized-rdf'] as any).future={meaning:'retained'};expect(()=>exportGeneralizedRdfDataset(encoding)).toThrow();expect(readDocument(writeDocument(encoding,'json'),'json')).toEqual(encoding);
 const q=getGeneralizedRdfQuads(d)[0]!;q.predicate.value='changed';expect(getGeneralizedRdfQuads(d)[0]!.predicate.value).toBe('same');expect(()=>proposeGeneralizedRdfQuadEdit(d,99,q)).toThrow();expect(()=>proposeGeneralizedRdfQuadEdit(d,0,{...q,predicate:{termType:'Literal',value:'invalid'}} as any)).toThrow();expect(exportGeneralizedRdfDataset(d)).toBe(source);
 const unsupported=importGeneralizedRdfDataset('{"future":{"n":9007199254740993}}',{id:'future'});expect(()=>getGeneralizedRdfQuads(unsupported)).toThrow();expect(exportGeneralizedRdfDataset(unsupported)).toBe('{"future":{"n":9007199254740993}}');
});
test('US-027-AC3: RDF JSON literals retain exact values and legacy typed lexical forms',async()=>{
 const raw=JSON.stringify([{subject:{termType:'NamedNode',value:'urn:s'},predicate:{termType:'BlankNode',value:'p'},object:{termType:'Literal',value:'{"n":9007199254740993}',datatype:{termType:'NamedNode',value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON'}},graph:{termType:'DefaultGraph',value:''}}]),d=importGeneralizedRdfDataset(raw,{id:'json'});
 for(const mode of ['json-ld-1.0','json-ld-1.1'] as const){const r=await proposeGeneralizedRdfToJsonLd(d,{id:'view',baseIRI:'https://example.org/',processingMode:mode,lossPolicy:'reject'});expect(reverse(r)).toBe(true);expect(r.status).toBe('candidate');const text=exportJsonLdDocument(r.candidate!);expect(text).toContain('9007199254740993');expect(text).not.toContain('9007199254740992');expect(text).toContain(mode==='json-ld-1.0'?'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON':'@json');expect(r.source).toEqual(d);}
 const unknown=importGeneralizedRdfDataset('{"future":9007199254740993}',{id:'unknown'}),blocked=await proposeGeneralizedRdfToJsonLd(unknown,{id:'view',baseIRI:'https://example.org/',processingMode:'json-ld-1.1',lossPolicy:'report'});expect(blocked.status).toBe('blocked');expect(blocked.source).toEqual(unknown);expect(blocked.candidate).toBeUndefined();await expect(proposeGeneralizedRdfToJsonLd(d,{id:1,baseIRI:'https://example.org/',processingMode:'json-ld-1.1',lossPolicy:'report'} as any)).rejects.toThrow();
});
