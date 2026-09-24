import {importShaclTurtle,importRdfTurtle,getShaclQuads,getShaclTargetNodes,writeDocument,readDocument} from '../src';
const prefix='native/shacl/sources/',manifest=await Bun.file(prefix+'manifest.json').json(),cases=[];
const inputs=[{shapes:'native/shacl/targets-shapes.ttl',data:'native/shacl/targets-data.ttl',baseIRI:'https://example.org/',origin:'authored'},...manifest.files.filter((f:any)=>f.path.includes('/tests/core/targets/')&&!f.path.endsWith('/manifest.ttl')).map((f:any)=>({shapes:prefix+f.path,data:prefix+f.path,baseIRI:f.url,origin:'official'}))];
for(const input of inputs){const source=await Bun.file(input.shapes).text(),d=importShaclTurtle(source,{id:input.shapes,baseIRI:input.baseIRI}),data=importRdfTurtle(await Bun.file(input.data).text(),{id:input.data,baseIRI:input.baseIRI});
 const nodes=new Map<string,any>();for(const q of getShaclQuads(d))if(q.subject.kind==='iri')nodes.set(q.subject.value,q.subject);
 const results=[];for(const shape of nodes.values()){
 const values=getShaclTargetNodes(d,shape,data);
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);if(JSON.stringify(getShaclTargetNodes(restored,shape,data))!==JSON.stringify(values))throw Error('Target round trip differs');}
 results.push({shape,values});}
 cases.push({...input,results});
}
await Bun.write('fixtures/shacl/target-results.json',JSON.stringify({claim:'Core target sets only, not validation reports',cases},null,2)+'\n');console.log({cases:cases.length,selections:cases.flatMap(c=>c.results).length});
