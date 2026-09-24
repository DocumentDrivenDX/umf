import {importIcebergTable,exportIcebergTable,inspectIcebergTableTransforms,proposeIcebergTableNodeEdit,writeDocument,readDocument} from '../src';
const base='fixtures/iceberg/table-binding/',minimal=await Bun.file('fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json').json();
const nested=structuredClone(minimal);nested['last-column-id']=4;nested.schemas[0].fields[0]={id:4,name:'nested',required:true,type:{type:'struct',fields:[{id:1,name:'a.b',required:true,type:'long'}]}};
const multi=structuredClone(minimal);multi['format-version']=3;multi['next-row-id']=0;for(const field of [multi['partition-specs'][0].fields[0],multi['sort-orders'][0].fields[0]]){delete field['source-id'];field['source-ids']=[1,2];field.transform='future_pair';}
const results=[];
for(const [id,value] of Object.entries({nested,multi})){
 const raw=JSON.stringify(value,null,2)+'\n',path=base+id+'.source.json';await Bun.write(path,raw);const d=importIcebergTable(raw,{id});
 for(const f of ['json','yaml'] as const)await Bun.write(base+id+'.'+f+'.json',exportIcebergTable(readDocument(writeDocument(d,f),f)));
 await Bun.write(base+id+'.edited.json',exportIcebergTable(proposeIcebergTableNodeEdit(d,'/location',JSON.stringify('s3://umf-fixture/relocated/'+id)).document));
 results.push({id,path,status:'roundtripped',binding:inspectIcebergTableTransforms(d)});
}
await Bun.write(base+'results.json',JSON.stringify({provenance:'Authored variants of pinned TableMetadataV2ValidMinimal; nested struct binding and v3 unknown multi-source preservation',results},null,2)+'\n');
