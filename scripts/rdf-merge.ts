import {importRdfNQuads,importRdfTurtle,importRdfTriG,exportRdfTriG,proposeRdfDatasetMerge,readDocument,writeDocument} from '../src';
const cases=[],anchorRaw=await Bun.file('native/rdf/examples/empty-graphs.trig').text(),anchor=importRdfTriG(anchorRaw,{id:'same-id',baseIRI:'https://example.org/schema.trig'});
await Bun.write('fixtures/rdf/merge/anchor.trig',exportRdfTriG(anchor));
for(const profile of ['nquads','turtle','trig']){
 const baseline=(await Bun.file('fixtures/rdf/'+profile+'/results.json').json()).results;
 for(const c of baseline.filter((c:any)=>c.positive)){
  const raw=await Bun.file(c.path).text(),options={id:'same-id',baseIRI:c.baseIRI},d=profile==='nquads'?importRdfNQuads(raw,options):profile==='turtle'?importRdfTurtle(raw,options):importRdfTriG(raw,options),id=profile+'-'+c.id,sourcePath='fixtures/rdf/merge/'+id+'.source.trig';const emission=structuredClone(d);(emission.modules[0]!.elements[0]!.extensions['umf.rdf'] as any).originalSource='';await Bun.write(sourcePath,exportRdfTriG(emission));
  const r=proposeRdfDatasetMerge([d,anchor],{id,graphPolicy:'union-by-name',blankNodePolicy:'disjoint-inputs'});if(r.status!=='candidate')throw Error(JSON.stringify(r.diagnostics));const exports=[];
  for(const format of ['json','yaml'] as const){const path='fixtures/rdf/merge/'+id+'.'+format+'.trig';await Bun.write(path,exportRdfTriG(readDocument(writeDocument(r.candidate!,format),format)));exports.push({format,path});}
  cases.push({id,profile,inputPath:c.path,baseIRI:c.baseIRI,sourcePath,exports,blankNodes:r.blankNodes,quadOrigins:r.quadOrigins});
 }
}
await Bun.write('fixtures/rdf/merge/results.json',JSON.stringify({cases},null,2)+'\n');console.log({cases:cases.length,exports:cases.length*2});
