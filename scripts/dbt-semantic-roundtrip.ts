import {createHash} from 'node:crypto';
import {importDbtSemanticManifest,exportDbtSemanticManifest,inspectDbtSemanticManifest,proposeDbtSemanticManifestNodeEdit,writeDocument,readDocument} from '../src';
const base='fixtures/dbt/semantic/',raw=await Bun.file(base+'semantic-manifest.json').text(),d=importDbtSemanticManifest(raw,{id:'semantic'}),results=[];
for(const [id,editPath,value] of [
 ['model','/semantic_models/0/description','Reviewed semantic model.'],
 ['metric','/metrics/0/description','Reviewed metric.'],
 ['saved-query','/saved_queries/0/description','Reviewed saved query.'],
]){
 const edit=proposeDbtSemanticManifestNodeEdit(d,editPath!,JSON.stringify(value));
 for(const f of ['json','yaml'] as const){await Bun.write(base+id+'.'+f+'.json',exportDbtSemanticManifest(readDocument(writeDocument(d,f),f)));await Bun.write(base+id+'.edited.'+f+'.json',exportDbtSemanticManifest(readDocument(writeDocument(edit.document,f),f)));}
 results.push({id,path:base+'semantic-manifest.json',sourceSha256:createHash('sha256').update(raw).digest('hex'),editPath,value,validation:inspectDbtSemanticManifest(d),candidateValidation:edit.validation});
}
await Bun.write(base+'results.json',JSON.stringify({results},null,2)+'\n');
