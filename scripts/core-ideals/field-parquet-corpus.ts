import {parquetFieldPaths} from './parquet-field-cases';
import {importParquetSchema,getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyParquetField,recoverParquetFieldBytes} from '../../src/core-ideals/parquet-field';
const rows=[];
for(const path of parquetFieldPaths){const bytes=new Uint8Array(await Bun.file(path).arrayBuffer()),source=upgradeFieldEnvelope(importParquetSchema(bytes,{id:path})).target;
 const fields=getParquetFieldMetadata(source).fields.map(f=>{const request={index:f.index,mode:'strict' as const},result=classifyParquetField(source,request);return {index:f.index,path:f.path,name:f.element.name,definitionLevel:f.definitionLevel,repetitionLevel:f.repetitionLevel,request,result};});
 for(const field of fields)if(field.result.status==='classified')await Bun.write(`.cache/parquet-field/${rows.length}-${field.index}.parquet`,recoverParquetFieldBytes(field.result,field.result.target!));
 rows.push({path,source,bytes:Array.from(bytes),fields});
}
await Bun.write('fixtures/validation/field-parquet-corpus.json',JSON.stringify({rows},null,2)+'\n');
