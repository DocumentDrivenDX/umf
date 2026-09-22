import {classifyParquetRecordType,recoverParquetRecordTypeBytes} from '../../src/core-ideals/parquet-record-type';
import {classifyParquetRecord,recoverParquetRecordBytes} from '../../src/core-ideals/parquet-record';
import {parquetFieldPaths} from './parquet-field-cases';
import {importParquetSchema,getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyParquetField,recoverParquetFieldBytes} from '../../src/core-ideals/parquet-field';
const rows=[];
for(const path of parquetFieldPaths){const bytes=new Uint8Array(await Bun.file(path).arrayBuffer()),source=upgradeFieldEnvelope(importParquetSchema(bytes,{id:path})).target;
 const fields=getParquetFieldMetadata(source).fields.map(f=>{const request={index:f.index,mode:'strict' as const},result=classifyParquetField(source,request);return {index:f.index,path:f.path,name:f.element.name,definitionLevel:f.definitionLevel,repetitionLevel:f.repetitionLevel,request,result};});
 for(const field of fields)if(field.result.status==='classified')await Bun.write(`.cache/parquet-field/${rows.length}-${field.index}.parquet`,recoverParquetFieldBytes(field.result,field.result.target!));
 const indices=[0,...getParquetFieldMetadata(source).fields.filter(f=>!Object.hasOwn(f.nativeField as object,'type')).map(f=>f.index)];
 const records=indices.map(index=>{const request={index,recordModule:'records',recordId:'record',mode:'strict' as const};return {request,result:classifyParquetRecord(source,request)};});
 for(const record of records)if(record.result.status==='classified')await Bun.write(`.cache/parquet-field/record-${rows.length}-${record.request.index}.parquet`,recoverParquetRecordBytes(record.result,record.result.target!));
 const recordTypes=indices.filter(index=>index>0).map(index=>{const request={index,recordModule:'records',recordId:'type',mode:'strict' as const};return {request,result:classifyParquetRecordType(source,request)};});
 for(const entry of recordTypes)if(entry.result.status==='classified')await Bun.write(`.cache/parquet-field/type-${rows.length}-${entry.request.index}.parquet`,recoverParquetRecordTypeBytes(entry.result,entry.result.target!));
 rows.push({path,source,bytes:Array.from(bytes),fields,records,recordTypes});
}
await Bun.write('fixtures/validation/field-parquet-corpus.json',JSON.stringify({rows},null,2)+'\n');
