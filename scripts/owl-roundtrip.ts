import {importOwlTurtle,exportOwlTurtle,getOwlQuads,getOwlOntologyHeaders,proposeOwlQuadEdit,writeDocument,readDocument} from '../src';
const results=[];
for(const file of ['primer-corrected','authored']){const raw=await Bun.file('native/owl/'+file+'.ttl').text(),doc=importOwlTurtle(raw,{id:file,baseIRI:'https://example.org/',blankNodeScope:file});
 for(const format of ['json','yaml'] as const){const encoded=writeDocument(doc,format),restored=readDocument(encoded,format);if(exportOwlTurtle(restored)!==raw)throw Error('Source differs');await Bun.write('fixtures/owl/'+file+'.'+format,encoded);
 const q=getOwlQuads(restored)[0]!,regenerated=proposeOwlQuadEdit(restored,0,q).document;await Bun.write('fixtures/owl/'+file+'.'+format+'.ttl',exportOwlTurtle(regenerated));results.push({file,format,quads:getOwlQuads(restored).length,headers:getOwlOntologyHeaders(restored)});
 }}await Bun.write('fixtures/owl/roundtrip-results.json',JSON.stringify(results,null,2)+'\n');console.log(results.map(r=>({file:r.file,format:r.format,quads:r.quads})));
