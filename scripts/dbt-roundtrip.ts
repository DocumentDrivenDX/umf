import {importDbtManifest,exportDbtManifest,inspectDbtManifest,proposeDbtManifestNodeEdit,writeDocument,readDocument} from '../src';
import {createHash} from 'node:crypto';
const base='fixtures/dbt/',raw=await Bun.file(base+'manifest.json').text(),d=importDbtManifest(raw,{id:'dbt-fixture'}),path='/nodes/model.umf_fixture.order_totals/description',edit=proposeDbtManifestNodeEdit(d,path,JSON.stringify('Reviewed synthetic customer totals.'));
for(const f of ['json','yaml'] as const){await Bun.write(base+'roundtrip.'+f+'.json',exportDbtManifest(readDocument(writeDocument(d,f),f)));await Bun.write(base+'edited.'+f+'.json',exportDbtManifest(readDocument(writeDocument(edit.document,f),f)));}
await Bun.write(base+'results.json',JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),source:'manifest.json',editPath:path,newDescription:'Reviewed synthetic customer totals.',sourceValidation:inspectDbtManifest(d),candidateValidation:edit.validation},null,2)+'\n');
