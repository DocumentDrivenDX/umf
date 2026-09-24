import {importJsonLdDocument,exportJsonLdDocument,proposeJsonLdExpansion,proposeJsonLdNodeEdit,readDocument,writeDocument} from '../src';
import {equalJsonLdText} from './jsonld-compare';
const cases=await Bun.file('native/jsonld/examples/numeric-cases.json').json(),results=[];
for(const c of cases){const source=importJsonLdDocument(c.source,{id:c.id,baseIRI:'https://example.org/source'}),r=await proposeJsonLdExpansion(source,{lossPolicy:'report'}),exports=[],edits=[];
 if(c.blocked){if(r.status!=='blocked')throw Error('Invalid numeric position accepted');results.push({id:c.id,status:r.status,diagnostics:r.diagnostics});continue;}
 if(!r.candidate||!equalJsonLdText(exportJsonLdDocument(r.candidate),c.expected))throw Error(c.id+': '+JSON.stringify(r));
 for(const format of ['json','yaml'] as const){const path='fixtures/jsonld/numeric/'+c.id+'.'+format+'.jsonld';await Bun.write(path,exportJsonLdDocument(readDocument(writeDocument(r.candidate,format),format)));exports.push({format,path});}
 if(c.edit){const e=await proposeJsonLdExpansion(proposeJsonLdNodeEdit(source,c.edit.pointer,c.edit.text).document,{lossPolicy:'report'});if(!e.candidate||!equalJsonLdText(exportJsonLdDocument(e.candidate),c.editedExpected))throw Error('Numeric edit differs');for(const format of ['json','yaml'] as const){const path='fixtures/jsonld/numeric/'+c.id+'.'+format+'.edited.jsonld';await Bun.write(path,exportJsonLdDocument(readDocument(writeDocument(e.candidate,format),format)));edits.push({format,path});}}
 results.push({id:c.id,status:r.status,diagnostics:r.diagnostics,exports,edits});}
await Bun.write('fixtures/jsonld/numeric/results.json',JSON.stringify({results},null,2)+'\n');console.log({cases:results.length,candidates:results.filter(r=>r.status==='candidate').length});
