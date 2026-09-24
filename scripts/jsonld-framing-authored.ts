import {equalCompactJsonLdText} from './jsonld-compare';
import {importJsonLdDocument,exportJsonLdDocument,proposeJsonLdFraming,proposeJsonLdNodeEdit,readDocument,writeDocument} from '../src';
const results=[];
for(const c of await Bun.file('native/jsonld/examples/framing-cases.json').json()){
 const inputs={id:c.id,baseIRI:'https://example.org/source',...c.inputs},options={lossPolicy:'report',...c.options},d=importJsonLdDocument(c.source,inputs),r=await proposeJsonLdFraming(d,options),exports=[],edits=[];
 if(r.status!==(c.blocked?'blocked':'candidate'))throw Error(c.id+': '+JSON.stringify(r.diagnostics));
 if(r.candidate){if(!equalCompactJsonLdText(exportJsonLdDocument(r.candidate),c.expected))throw Error(c.id+': '+exportJsonLdDocument(r.candidate));for(const format of ['json','yaml'] as const){const path='fixtures/jsonld/framing/authored/'+c.id+'.'+format+'.jsonld';await Bun.write(path,exportJsonLdDocument(readDocument(writeDocument(r.candidate,format),format)));exports.push({format,path});}}
 if(c.edit){const edit=await proposeJsonLdFraming(proposeJsonLdNodeEdit(d,c.edit.pointer,c.edit.text).document,options);if(!edit.candidate||!equalCompactJsonLdText(exportJsonLdDocument(edit.candidate),c.editedExpected))throw Error('Edit '+c.id);for(const format of ['json','yaml'] as const){const path='fixtures/jsonld/framing/authored/'+c.id+'.edited.'+format+'.jsonld';await Bun.write(path,exportJsonLdDocument(readDocument(writeDocument(edit.candidate,format),format)));edits.push({format,path});}}
 results.push({...c,inputs,options,status:r.status,diagnostics:r.diagnostics,resourcesUsed:r.resourcesUsed,exports,edits});
}
await Bun.write('fixtures/jsonld/framing/authored/results.json',JSON.stringify({results},null,2)+'\n');console.log({authored:results.length,candidates:results.filter(r=>r.status==='candidate').length});
