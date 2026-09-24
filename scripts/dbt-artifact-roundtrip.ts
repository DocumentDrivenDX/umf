import {createHash} from 'node:crypto';
import {importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,proposeDbtArtifactNodeEdit,writeDocument,readDocument} from '../src';
const base='fixtures/dbt/artifacts/',results=[];
const failurePath='fixtures/dbt/failure/run-results.json';
const failureIndex=(await Bun.file(failurePath).json()).results.findIndex((r:any)=>r.unique_id==='model.umf_failure.broken');
if(failureIndex<0)throw Error('Missing native SQL-error result');
for(const [id,path,editPath,value] of [
 ['run-results',base+'run-results.json','/results/0/message','INSERT 3 [reviewed fixture]'],
 ['rich-run-results','fixtures/dbt/rich/build-run-results.json','/results/0/message','Reviewed synthetic run message.'],
 ['failure-run-results',failurePath,'/results/'+failureIndex+'/message','Reviewed synthetic SQL error; original outcome retained.'],
 ['catalog',base+'catalog.json','/nodes/model.umf_fixture.order_totals/columns/total_amount/comment','Reviewed observed column.'],
]){
 const raw=await Bun.file(path!).text(),d=importDbtArtifact(raw,{id:id!}),edit=proposeDbtArtifactNodeEdit(d,editPath!,JSON.stringify(value));
 for(const f of ['json','yaml'] as const){await Bun.write(base+id+'.'+f+'.json',exportDbtArtifact(readDocument(writeDocument(d,f),f)));await Bun.write(base+id+'.edited.'+f+'.json',exportDbtArtifact(readDocument(writeDocument(edit.document,f),f)));}
 results.push({id,path,sourceSha256:createHash('sha256').update(raw).digest('hex'),editPath,value,validation:inspectDbtArtifact(d),candidateValidation:edit.validation});
}
await Bun.write(base+'results.json',JSON.stringify({scope:'Captured run outcomes and catalog observations; message/comment candidate edits do not change actual execution or warehouse state',results},null,2)+'\n');
