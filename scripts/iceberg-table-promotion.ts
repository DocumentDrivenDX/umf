import {importIcebergTable,exportIcebergTable,proposeIcebergTablePromotion,writeDocument,readDocument} from '../src';
const base='fixtures/iceberg/table-promotion/',minimal=await Bun.file('fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json').json(),results=[];
for(const [id,sourceType,targetType,transform] of [
 ['int-identity','int','long','identity'],['int-bucket','int','long','bucket[16]'],['int-truncate','int','long','truncate[4]'],
 ['float-identity','float','double','identity'],['decimal-bucket','decimal(9, 2)','decimal(18, 2)','bucket[16]'],['decimal-truncate','decimal(9, 2)','decimal(18, 2)','truncate[4]'],
] as const){
 const raw=structuredClone(minimal);raw.schemas[0].fields[0].type=sourceType;raw['partition-specs'][0].fields[0].transform=transform;
 const path=base+id+'.source.json';await Bun.write(path,JSON.stringify(raw,null,2)+'\n');
 const options={fieldId:1,nextSchemaId:1,targetType},source=importIcebergTable(JSON.stringify(raw),{id}),candidate=proposeIcebergTablePromotion(source,options);
 for(const f of ['json','yaml'] as const)await Bun.write(base+id+'.'+f+'.json',exportIcebergTable(readDocument(writeDocument(candidate.document,f),f)));
 results.push({id,path,...options,report:candidate.report});
}
await Bun.write(base+'results.json',JSON.stringify({scope:'Authored primitive widening variants of pinned TableMetadataV2ValidMinimal; no data execution or commits',results},null,2)+'\n');
