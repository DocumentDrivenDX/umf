import {equalJsonLdText} from './jsonld-compare';
import {importRdfNQuads,importRdfTriG,exportRdfNQuads,exportRdfTriG,getRdfQuads,proposeRdfQuadEdit,proposeRdfToJsonLd,exportJsonLdDocument,readDocument,writeDocument} from '../src';
const results=[];
for(const c of await Bun.file('native/jsonld/examples/from-rdf-cases.json').json()){
 const options={id:c.id+'-jsonld',baseIRI:'https://example.org/source',lossPolicy:'report',...c.options},d=c.syntax==='trig'?importRdfTriG(c.source,{id:c.id,baseIRI:options.baseIRI}):importRdfNQuads(c.source,{id:c.id}),r=await proposeRdfToJsonLd(d,options),exports=[],edits=[];
 if(r.status!==(c.blocked?'blocked':'candidate'))throw Error(c.id+JSON.stringify(r.diagnostics));
 if(r.candidate){if(!equalJsonLdText(exportJsonLdDocument(r.candidate),c.expected))throw Error(c.id+exportJsonLdDocument(r.candidate));for(const format of ['json','yaml'] as const){const path='fixtures/jsonld/from-rdf/authored/'+c.id+'.'+format+'.jsonld';await Bun.write(path,exportJsonLdDocument(readDocument(writeDocument(r.candidate,format),format)));exports.push({format,path});}}
 for(const format of ['json','yaml'] as const){const recovered=readDocument(writeDocument(r.source,format),format);if((c.syntax==='trig'?exportRdfTriG(recovered):exportRdfNQuads(recovered))!==c.source)throw Error('Source changed');}
 if(c.edit){const q=getRdfQuads(d)[c.edit.index]!;if(q.object.kind!=='literal')throw Error('Expected literal');q.object.value=c.edit.value;const e=await proposeRdfToJsonLd(proposeRdfQuadEdit(d,c.edit.index,q).document,options);if(!e.candidate||!equalJsonLdText(exportJsonLdDocument(e.candidate),c.editedExpected))throw Error('Edit differs');for(const format of ['json','yaml'] as const){const path='fixtures/jsonld/from-rdf/authored/'+c.id+'.edited.'+format+'.jsonld';await Bun.write(path,exportJsonLdDocument(readDocument(writeDocument(e.candidate,format),format)));edits.push({format,path});}}
 results.push({...c,options,status:r.status,diagnostics:r.diagnostics,exports,edits});
}
await Bun.write('fixtures/jsonld/from-rdf/authored/results.json',JSON.stringify({results},null,2)+'\n');console.log({authored:results.length,candidates:results.filter(r=>r.status==='candidate').length});
