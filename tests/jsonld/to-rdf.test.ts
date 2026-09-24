import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/jsonld/to-rdf-schema.json';
import {importJsonLdDocument,proposeJsonLdToRdf,proposeRdfToJsonLd,proposeJsonLdNodeEdit,exportJsonLdDocument,exportRdfNQuads,getRdfQuads,readDocument,writeDocument} from '../../src';
import {equalJsonLdText} from '../../scripts/jsonld-compare';
const check=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema);
test('US-026-AC13: complete toRDF corpus retains sources, candidates and every gap',async()=>{
 const cases=(await Bun.file('fixtures/jsonld/to-rdf/results.json').json()).cases,manifest=await Bun.file('native/jsonld/sources/toRdf-manifest.jsonld').json();expect(cases.map((c:any)=>c.id)).toEqual(manifest.sequence.map((c:any)=>c['@id'].slice(1)));expect(cases).toHaveLength(467);
 expect(cases.filter((c:any)=>c.positive&&c.status==='blocked').map((c:any)=>c.id)).toEqual([]);expect(cases.filter((c:any)=>!c.positive&&c.status==='candidate')).toHaveLength(0);
 for(const c of cases){const raw=await Bun.file(c.path).text(),d=importJsonLdDocument(raw,c.inputs),r=await proposeJsonLdToRdf(d,c.options);expect(check(r)).toBe(true);expect(r.status).toBe(c.status);expect(r.diagnostics).toEqual(c.diagnostics);expect(r.resourcesUsed).toEqual(c.resourcesUsed);expect(r.source).toEqual(d);for(const format of ['json','yaml'] as const){expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(raw);if(r.candidate)expect(exportRdfNQuads(readDocument(writeDocument(r.candidate,format),format))).toBe(await Bun.file(c.exports.find((e:any)=>e.format===format).path).text());}}
},180000);
test('US-026-AC13: loss guards, opaque JSON, known literal/list terms and copied edits',async()=>{
 const cases=(await Bun.file('fixtures/jsonld/to-rdf/authored/results.json').json()).results;expect(cases).toHaveLength(48);
 for(const c of cases){const d=importJsonLdDocument(c.source,c.inputs),r=await proposeJsonLdToRdf(d,c.options);expect(check(r)).toBe(true);expect(r.status).toBe(c.status);expect(r.source).toEqual(d);expect(r.diagnostics).toEqual(c.diagnostics);if(c.blocked)expect(r.candidate).toBeUndefined();for(const format of ['json','yaml'] as const){expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(c.source);if(r.candidate)expect(exportRdfNQuads(readDocument(writeDocument(r.candidate,format),format))).toBe(await Bun.file(c.exports.find((e:any)=>e.format===format).path).text());}
 if(c.id==='basic'){expect(exportRdfNQuads(r.candidate!)).toBe('<urn:s> <urn:p> "hello" .\n');const e=await proposeJsonLdToRdf(proposeJsonLdNodeEdit(d,'/p','"changed"').document,c.options);expect(exportRdfNQuads(e.candidate!)).toBe('<urn:s> <urn:p> "changed" .\n');expect(exportJsonLdDocument(d)).toBe(c.source);}
 expect(r.numericPolicy).toBe(c.options.numericPolicy??'strict');
 if(c.numberLoss)expect(r.diagnostics.some(d=>d.code==='JSONLD_RDF_NUMBER_LOSS'&&d.path.startsWith('/'))).toBe(true);
 if(c.expectedValues&&r.candidate)expect(getRdfQuads(r.candidate).map(q=>(q.object as any).value).sort()).toEqual([...c.expectedValues].sort());
 if(c.quadCount!==undefined&&r.candidate)expect(getRdfQuads(r.candidate).length).toBe(c.quadCount);
 if(c.id.startsWith('invalid-')||c.id.startsWith('fragment-'))expect(r.diagnostics.some(d=>d.code==='JSONLD_RDF_TERM')).toBe(true);
 if(c.roundtrip){for(const format of ['json','yaml'] as const){const back=await proposeRdfToJsonLd(readDocument(writeDocument(r.candidate!,format),format),{id:'back',baseIRI:c.inputs.baseIRI,lossPolicy:'reject',rdfDirection:'compound-literal'});expect(back.status).toBe('candidate');expect(equalJsonLdText(exportJsonLdDocument(back.candidate!),JSON.stringify(c.roundtrip))).toBe(true);}const qs=getRdfQuads(r.candidate!);if(c.id==='compound-graph')expect(qs.every(q=>q.graph.kind==='iri'&&q.graph.value==='urn:g')).toBe(true);if(c.id==='compound-distinct'){const roots=qs.filter(q=>q.predicate.value==='urn:p').map(q=>(q.object as any).value);expect(new Set(roots).size).toBe(2);}}
 if(c.id==='list'){const qs=getRdfQuads(r.candidate!);expect(qs).toHaveLength(5);expect(qs.filter(q=>q.predicate.value.endsWith('#first')).map(q=>(q.object as any).value)).toEqual(['a','b']);}
 if(c.id==='direction-i18n')expect(exportRdfNQuads(r.candidate!)).toBe('<urn:s> <urn:p> "v"^^<https://www.w3.org/ns/i18n#en_rtl> .\n');
 if(c.id==='opaque-json'){expect(r.diagnostics.some(d=>['JSONLD_RDF_INDEX','JSONLD_RDF_EMPTY_GRAPH'].includes(d.code))).toBe(false);const q=getRdfQuads(r.candidate!)[0]!;expect(JSON.parse((q.object as any).value)).toEqual({'@index':'data','@graph':[],a:[2,1]});}
 }
 const d=importJsonLdDocument('{"@id":"urn:s","urn:p":"v"}',{id:'guard',baseIRI:'https://example.org/'});(d.modules[0]!.elements[0]!.extensions['umf.jsonld'] as any).future={meaning:'kept'};const r=await proposeJsonLdToRdf(d,{id:'out',lossPolicy:'report'});expect(r.status).toBe('blocked');expect(r.source).toEqual(d);await expect(proposeJsonLdToRdf(d,{id:'out',lossPolicy:'guess'} as any)).rejects.toThrow();await expect(proposeJsonLdToRdf(d,{id:'out',lossPolicy:'report',numericPolicy:'guess'} as any)).rejects.toThrow();
},30000);
test('US-026-AC13: native comparisons retain mismatches and non-comparable generalized datasets',async()=>{
 const rows=(await Bun.file('fixtures/jsonld/to-rdf/rdf-oracle-results.json').json()).results,native=(await Bun.file('fixtures/jsonld/to-rdf/oracle-results.json').json()).results;expect(rows).toHaveLength(467);expect(native).toHaveLength(467);
 expect(rows.filter((r:any)=>r.exports.some((e:any)=>e.officialEqual===false)).map((r:any)=>r.id)).toEqual([]);expect(rows.filter((r:any)=>r.exports.some((e:any)=>e.officialError)).map((r:any)=>r.id)).toEqual(['t0118','te075']);expect(rows.filter((r:any)=>r.exports.some((e:any)=>e.nativeEqual===false)).map((r:any)=>r.id)).toEqual(['tc036','tc037','tc038','tdi11','tdi12','te014','te111','te112','trt01','ttn02']);expect(rows.filter((r:any)=>r.exports.length&&r.exports.every((e:any)=>e.officialEqual===true))).toHaveLength(343);
 expect(native.filter((r:any)=>(r.native==='accepted')!==(r.umf==='candidate')).map((r:any)=>r.id)).toEqual(['te026','te071','te122','ter24','ter32','ter56','tli14']);
});
