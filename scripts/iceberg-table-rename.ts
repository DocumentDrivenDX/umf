import {importIcebergTable,exportIcebergTable,proposeIcebergTableRename,writeDocument,readDocument} from '../src';
const base='fixtures/iceberg/table-rename/',results=[];
for(const [id,path] of Object.entries({v2:'fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2Valid.json',minimal:'fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json',v3:'fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV3ValidMinimal.json',nested:'fixtures/iceberg/table-binding/nested.source.json'})){
 const raw=await Bun.file(path).text(),parsed=JSON.parse(raw),fieldId=1,newName='renamed_column',nextSchemaId=Math.max(...parsed.schemas.map((s:any)=>s['schema-id']))+1;
 const source=importIcebergTable(raw,{id}),candidate=proposeIcebergTableRename(source,{fieldId,newName,nextSchemaId});
 for(const f of ['json','yaml'] as const)await Bun.write(base+id+'.'+f+'.json',exportIcebergTable(readDocument(writeDocument(candidate.document,f),f)));
 results.push({id,path,fieldId,newName,nextSchemaId,report:candidate.report});
}
await Bun.write(base+'results.json',JSON.stringify({scope:'Authored schema-version rename candidates over pinned upstream and nested fixtures; no commit',results},null,2)+'\n');
