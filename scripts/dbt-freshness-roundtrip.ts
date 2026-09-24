import {createHash} from 'node:crypto';
import {importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,proposeDbtArtifactNodeEdit,writeDocument,readDocument} from '../src';
const base='fixtures/dbt/freshness/',results=[];
for(const [id,path] of [['sources','/results/0/adapter_response/_message'],['runner-results','/results/0/error']]){
 const raw=await Bun.file(base+id+'.json').text(),d=importDbtArtifact(raw,{id:id!}),value='Reviewed synthetic diagnostic.',candidate=proposeDbtArtifactNodeEdit(d,path!,JSON.stringify(value));
 for(const f of ['json','yaml'] as const){await Bun.write(base+id+'.'+f+'.json',exportDbtArtifact(readDocument(writeDocument(d,f),f)));await Bun.write(base+id+'.edited.'+f+'.json',exportDbtArtifact(readDocument(writeDocument(candidate.document,f),f)));}
 results.push({id,path,value,sourceSha256:createHash('sha256').update(raw).digest('hex'),validation:inspectDbtArtifact(d)});
}
await Bun.write(base+'results.json',JSON.stringify({scope:'Separate emitted artifact and native reconstruction from all runner results; diagnostic edits are candidates only',results},null,2)+'\n');
