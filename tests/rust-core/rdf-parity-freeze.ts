// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze complete TypeScript predecessor outcomes for the production RDF wire.
// Run with `bun tests/rust-core/rdf-parity-freeze.ts`; the Rust wire corpus test
// replays this small packet in one process.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {encodeWire} from '../../bindings/core/node/src/wire.js';
import {
 importRdfNQuads,exportRdfNQuads,inspectRdfDocument,getRdfQuads,
 proposeRdfQuadEdit,proposeRdfIriRename,importRdfTurtle,exportRdfTurtle,
 importRdfTriG,exportRdfTriG,getRdfNamedGraphs,proposeRdfDatasetMerge,
} from '../../src/adapters/rdf/index.ts';
import {
 importGeneralizedRdfDataset,exportGeneralizedRdfDataset,
 inspectGeneralizedRdfDocument,getGeneralizedRdfQuads,
 proposeGeneralizedRdfQuadEdit,
} from '../../src/adapters/generalized-rdf/index.ts';

const PROFILE='umf-r9-rdf-preservation/0.1.0';
const units=(value:string)=>Array.from({length:value.length},(_,index)=>value.charCodeAt(index));
type Request=Record<string,unknown>&{profile:string;op:string};
type FrozenCase={label:string;requestWire:string;expected:{status:'ok';wire:string}|{status:'error';code:string|null;pathUnits:number[];messageUnits:number[]}};
const cases:FrozenCase[]=[];
function freeze(label:string,request:Request,run:()=>unknown){
 try{cases.push({label,requestWire:encodeWire(request),expected:{status:'ok',wire:encodeWire(run())}});}
 catch(error){const failure=error as Error&{code?:unknown;path?:unknown},path=typeof failure.path==='string'?failure.path:'';cases.push({label,requestWire:encodeWire(request),expected:{status:'error',code:typeof failure.code==='string'?failure.code:null,pathUnits:units(path),messageUnits:units(String(failure.message))}});}
}
const req=(op:string,fields:Record<string,unknown>={}):Request=>({profile:PROFILE,op,...fields});
const nquadsText='<urn:s> <urn:p> "before" .\n<urn:s> <urn:q> <urn:o> .\n';
const turtleText='@prefix : <vocab/> . _:g_0 :p [ :p ( <item> _:g_0 ) ] . <item> :number +001 .';
const trigText=await Bun.file('native/rdf/examples/empty-graphs.trig').text();
const nquads=importRdfNQuads(nquadsText,{id:'rdf-parity-nq'});
const turtle=importRdfTurtle(turtleText,{id:'rdf-parity-turtle',baseIRI:'https://example.org/path/source.ttl'});
const trig=importRdfTriG(trigText,{id:'rdf-parity-trig',baseIRI:'https://example.org/'});
const nqTerms=getRdfQuads(nquads),changedQuad={...nqTerms[0]!,object:{kind:'literal' as const,value:'after',datatype:'http://www.w3.org/2001/XMLSchema#string'}};
const generalizedText=String.raw`[{"subject":{"termType":"NamedNode","value":"urn:s"},"predicate":{"termType":"NamedNode","value":"urn:p"},"object":{"termType":"Literal","value":"x","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}},"graph":{"termType":"DefaultGraph","value":""}}]`;
const generalized=importGeneralizedRdfDataset(generalizedText,{id:'rdf-parity-generalized'});
const generalizedTerms=getGeneralizedRdfQuads(generalized),changedGeneralized={...generalizedTerms[0]!,object:{termType:'Literal' as const,value:'changed',datatype:{termType:'NamedNode' as const,value:'http://www.w3.org/2001/XMLSchema#string'}}};

// All 17 public data operations: source imports, complete inspections, reads,
// exports, candidate edits/renames, graph selection, merge, and generalized RDF.
freeze('nquads.import',req('rdf.importNQuads',{source:nquadsText,options:{id:'rdf-parity-nq'}}),()=>nquads);
freeze('nquads.inspect',req('rdf.inspect',{document:nquads}),()=>inspectRdfDocument(nquads));
freeze('nquads.get',req('rdf.getQuads',{document:nquads}),()=>getRdfQuads(nquads));
freeze('nquads.export',req('rdf.exportNQuads',{document:nquads}),()=>exportRdfNQuads(nquads));
freeze('nquads.edit',req('rdf.editQuad',{document:nquads,index:0,replacement:changedQuad}),()=>proposeRdfQuadEdit(nquads,0,changedQuad));
freeze('nquads.rename',req('rdf.renameIri',{document:nquads,options:{from:'urn:s',to:'urn:renamed'}}),()=>proposeRdfIriRename(nquads,{from:'urn:s',to:'urn:renamed'}));
freeze('turtle.import-nested-list',req('rdf.importTurtle',{source:turtleText,options:{id:'rdf-parity-turtle',baseIRI:'https://example.org/path/source.ttl'}}),()=>turtle);
freeze('turtle.export',req('rdf.exportTurtle',{document:turtle}),()=>exportRdfTurtle(turtle));
freeze('trig.import-empty-graphs',req('rdf.importTriG',{source:trigText,options:{id:'rdf-parity-trig',baseIRI:'https://example.org/'}}),()=>trig);
freeze('trig.named-graphs',req('rdf.getNamedGraphs',{document:trig}),()=>getRdfNamedGraphs(trig));
freeze('trig.export',req('rdf.exportTriG',{document:trig}),()=>exportRdfTriG(trig));
freeze('nquads.merge',req('rdf.mergeDatasets',{documents:[nquads,turtle],options:{id:'rdf-parity-merge',graphPolicy:'union-by-name',blankNodePolicy:'disjoint-inputs'}}),()=>proposeRdfDatasetMerge([nquads,turtle],{id:'rdf-parity-merge',graphPolicy:'union-by-name',blankNodePolicy:'disjoint-inputs'}));
freeze('generalized.import',req('rdf.importGeneralizedDataset',{source:generalizedText,options:{id:'rdf-parity-generalized'}}),()=>generalized);
freeze('generalized.inspect',req('rdf.inspectGeneralized',{document:generalized}),()=>inspectGeneralizedRdfDocument(generalized));
freeze('generalized.export',req('rdf.exportGeneralizedDataset',{document:generalized}),()=>exportGeneralizedRdfDataset(generalized));
freeze('generalized.get',req('rdf.getGeneralizedQuads',{document:generalized}),()=>getGeneralizedRdfQuads(generalized));
freeze('generalized.edit',req('rdf.editGeneralizedQuad',{document:generalized,index:0,replacement:changedGeneralized}),()=>proposeGeneralizedRdfQuadEdit(generalized,0,changedGeneralized));

// Unknown envelope fields stay observable and block native interpretation or
// export. A future source includes an isolated UTF-16 unit to verify transport.
const unknownRdf=structuredClone(nquads) as any;
unknownRdf.modules[0].elements[0].extensions['umf.rdf']['future\ud800']={text:'kept\ud800'};
freeze('nquads.unknown-inspect',req('rdf.inspect',{document:unknownRdf}),()=>inspectRdfDocument(unknownRdf));
freeze('nquads.unknown-export-refusal',req('rdf.exportNQuads',{document:unknownRdf}),()=>exportRdfNQuads(unknownRdf));
const generalizedOverflow=String.raw`[{"subject":{"termType":"NamedNode","value":"urn:s"},"predicate":{"termType":"NamedNode","value":"urn:p"},"object":{"termType":"Literal","value":"x","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}},"graph":{"termType":"DefaultGraph","value":""},"future":{"exact":1e400}}]`;
const overflow=importGeneralizedRdfDataset(generalizedOverflow,{id:'rdf-parity-1e400'});
freeze('generalized.1e400.inspect',req('rdf.inspectGeneralized',{document:overflow}),()=>inspectGeneralizedRdfDocument(overflow));
freeze('generalized.1e400.export',req('rdf.exportGeneralizedDataset',{document:overflow}),()=>exportGeneralizedRdfDataset(overflow));
freeze('generalized.1e400.get-refusal',req('rdf.getGeneralizedQuads',{document:overflow}),()=>getGeneralizedRdfQuads(overflow));
const generalizedUnknown=structuredClone(generalized) as any;
generalizedUnknown.modules[0].elements[0].extensions['umf.generalized-rdf'].future='retained';
freeze('generalized.unknown-inspect',req('rdf.inspectGeneralized',{document:generalizedUnknown}),()=>inspectGeneralizedRdfDocument(generalizedUnknown));
freeze('generalized.unknown-export-refusal',req('rdf.exportGeneralizedDataset',{document:generalizedUnknown}),()=>exportGeneralizedRdfDataset(generalizedUnknown));

for (const [label, source] of [
 ['version-prefix', '@prefix VERSION: <urn:example:> . @prefix ex: <urn:ex:> . VERSION:s ex:VERSION ex:my-VERSION .'],
 ['version-directive', 'VERSION "1.2"\n'],
 ['at-version-directive', '@version "1.2" .\n'],
] as const) {
 const options={id:`rdf-parity-${label}`,baseIRI:'urn:base:'};
 freeze(`turtle.${label}`,req('rdf.importTurtle',{source,options}),()=>importRdfTurtle(source,options));
}

const packet={format:'umf-r9-rdf-predecessor/1',profile:PROFILE,cases};
const output=resolve(process.env.RDF_PARITY_PACKET??'tests/rust-core/rdf-parity-freeze.json');
writeFileSync(output,`${JSON.stringify(packet)}\n`,'utf8');
console.log(`frozen ${cases.length} RDF outcomes to ${output}`);
