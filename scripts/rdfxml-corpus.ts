import {probeRdfXml,type Profile} from '../native/rdfxml/probe';
const manifest=await Bun.file('native/rdfxml/sources/sources.json').json(),results=[];
for(const f of manifest.files)if(new Bun.CryptoHasher('sha256').update(await Bun.file(f.path).arrayBuffer()).digest('hex')!==f.sha256)throw Error('Source digest differs: '+f.path);
for(const c of manifest.cases){const input=await Bun.file(c.path).text();for(const profile of ['baseline','finalized','literal-namespaces'] as Profile[])results.push({...c,input,profile,...await probeRdfXml(input,c.baseIRI,profile)});}
await Bun.write('fixtures/rdfxml/corpus.json',JSON.stringify({parser:'rdfxml-streaming-parser@3.3.0',commit:manifest.commit,results},null,2)+'\n');
console.log({cases:manifest.cases.length,runs:results.length,syntaxDisagreements:results.filter(r=>r.positive!==r.accepted).map(r=>({id:r.id,profile:r.profile,positive:r.positive,accepted:r.accepted,error:r.error}))});
