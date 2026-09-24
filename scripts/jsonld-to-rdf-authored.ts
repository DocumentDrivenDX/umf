import {importJsonLdDocument,proposeJsonLdToRdf,proposeRdfToJsonLd,proposeJsonLdNodeEdit,exportJsonLdDocument,exportRdfNQuads,getRdfQuads,readDocument,writeDocument} from '../src';
import {equalJsonLdText} from './jsonld-compare';
const results=[];
for(const c of await Bun.file('native/jsonld/examples/to-rdf-cases.json').json()){
 const inputs={id:c.id,baseIRI:'https://example.org/'},d=importJsonLdDocument(c.source,inputs),r=await proposeJsonLdToRdf(d,c.options),exports=[];
 if(r.status!==(c.blocked?'blocked':'candidate'))throw Error(c.id+JSON.stringify(r));
 for(const format of ['json','yaml'] as const){if(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))!==c.source)throw Error('Source differs');if(r.candidate){const path='fixtures/jsonld/to-rdf/authored/'+c.id+'.'+format+'.nq';await Bun.write(path,exportRdfNQuads(readDocument(writeDocument(r.candidate,format),format)));exports.push({format,path});}}
 if(c.numberLoss&&!r.diagnostics.some(d=>d.code==='JSONLD_RDF_NUMBER_LOSS'&&d.path.startsWith('/')))throw Error('Missing numeric loss '+c.id);
 if(c.expectedValues&&r.candidate&&JSON.stringify(getRdfQuads(r.candidate).map(q=>(q.object as any).value).sort())!==JSON.stringify([...c.expectedValues].sort()))throw Error('Literal values differ '+c.id);
 if(c.quadCount!==undefined&&r.candidate&&getRdfQuads(r.candidate).length!==c.quadCount)throw Error('Quad count differs '+c.id);
 if(c.roundtrip){const back=await proposeRdfToJsonLd(r.candidate!,{id:c.id+'-back',baseIRI:inputs.baseIRI,lossPolicy:'reject',rdfDirection:'compound-literal'});if(!back.candidate||!equalJsonLdText(exportJsonLdDocument(back.candidate),JSON.stringify(c.roundtrip)))throw Error('Compound roundtrip differs '+c.id);}
 results.push({...c,inputs,status:r.status,diagnostics:r.diagnostics,exports,quads:r.candidate?getRdfQuads(r.candidate):undefined});
}
await Bun.write('fixtures/jsonld/to-rdf/authored/results.json',JSON.stringify({results},null,2)+'\n');console.log({authored:results.length,candidates:results.filter(r=>r.status==='candidate').length});
const probe=await Bun.file('fixtures/jsonld/to-rdf/unicode-iri-gap.json').json();
const resolution=await proposeJsonLdToRdf(importJsonLdDocument(probe.source,{id:'unicode-iri-resolution',baseIRI:'https://example.org/'}),{id:'resolved-rdf',lossPolicy:'reject'});
if(!resolution.candidate||exportRdfNQuads(resolution.candidate)!==probe.expected)throw Error('Unicode IRI probe is unresolved');
await Bun.write('fixtures/jsonld/to-rdf/unicode-iri-resolution.json',JSON.stringify({priorEvidence:'fixtures/jsonld/to-rdf/unicode-iri-gap.json',report:resolution,output:exportRdfNQuads(resolution.candidate),expected:probe.expected,resolved:true},null,2)+'\n');
