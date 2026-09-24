import {importRdfNQuads,getRdfQuads,proposeRdfIriRename,exportRdfNQuads,readDocument,writeDocument} from '../src';
const baseline=await Bun.file('fixtures/rdf/nquads/results.json').json(),cases=[];
const inputs=baseline.results.filter((c:any)=>c.positive&&c.quads>0).map((c:any)=>({id:c.id,path:c.path}));inputs.push({id:'all-positions',path:'native/rdf/examples/rename.nq'},{id:'datatype',path:'native/rdf/examples/schema.nq'});
for(const c of inputs){const raw=await Bun.file(c.path).text(),d=importRdfNQuads(raw,{id:c.id}),first=getRdfQuads(d)[0]!,from=c.id==='datatype'?'http://www.w3.org/2001/XMLSchema#integer':c.id==='all-positions'?'urn:old':first.subject.kind==='iri'?first.subject.value:first.predicate.value,to='urn:umf:renamed:'+encodeURIComponent(c.id),exports=[];
 for(const format of ['json','yaml'] as const){const source=readDocument(writeDocument(d,format),format),r=proposeRdfIriRename(source,{from,to});if(r.status!=='candidate')throw Error(JSON.stringify(r.diagnostics));if(exportRdfNQuads(r.source)!==raw)throw Error('Source differs');const output=exportRdfNQuads(readDocument(writeDocument(r.candidate!,format),format)),path='fixtures/rdf/rename/'+c.id+'.'+format+'.nq';await Bun.write(path,output);exports.push({format,path,changes:r.changes});}
 cases.push({...c,from,to,exports});
}
await Bun.write('fixtures/rdf/rename/results.json',JSON.stringify({cases},null,2)+'\n');console.log({cases:cases.length,exports:cases.length*2});
