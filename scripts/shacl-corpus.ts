import {createHash} from 'node:crypto';
import {importShaclTurtle,exportShaclTurtle,getShaclQuads,getShaclPropertyPath,writeDocument,readDocument} from '../src';
const manifest=await Bun.file('native/shacl/sources/manifest.json').json(),cases=[];
for(const file of manifest.files){const sourcePath='native/shacl/sources/'+file.path,bytes=await Bun.file(sourcePath).arrayBuffer();if(createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==file.sha256)throw Error('Source hash differs: '+file.path);if(!file.path.startsWith('data-shapes-test-suite/tests/')||!file.path.endsWith('.ttl'))continue;
 const source=await Bun.file(sourcePath).text(),d=importShaclTurtle(source,{id:file.url,baseIRI:file.url}),exports=[],paths=[];
 for(const format of ['json','yaml'] as const){const text=exportShaclTurtle(readDocument(writeDocument(d,format),format));if(text!==source)throw Error('Source changed: '+file.path);const path='fixtures/shacl/corpus/'+file.path+'.'+format+'.ttl';await Bun.write(path,text);exports.push({format,path});}
 if(file.path.includes('/core/path/')){const seen=new Set<string>();for(const q of getShaclQuads(d)){if(q.predicate.value!=='http://www.w3.org/ns/shacl#path'||seen.has(JSON.stringify(q.subject)))continue;seen.add(JSON.stringify(q.subject));try{paths.push({shape:q.subject,status:'compiled',path:getShaclPropertyPath(d,q.subject)});}catch(e){paths.push({shape:q.subject,status:'blocked',error:String(e)});}}}
 cases.push({path:sourcePath,baseIRI:file.url,exports,paths});
}
await Bun.write('fixtures/shacl/corpus-results.json',JSON.stringify({revision:manifest.revision,claim:'Native source graph round trips only; official validation reports are preserved but not executed',cases},null,2)+'\n');console.log({sources:cases.length,compiled:cases.flatMap(c=>c.paths).filter(p=>p.status==='compiled').length,blocked:cases.flatMap(c=>c.paths).filter(p=>p.status==='blocked')});
