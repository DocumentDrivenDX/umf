import {test,expect} from 'bun:test';
import {parquetFieldPaths} from '../../scripts/core-ideals/parquet-field-cases';
import {classifyParquetRecord,recoverParquetRecordBytes} from '../../src/core-ideals/parquet-record';
import {importParquetSchema,getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {copyJson} from '../../src/model/json';import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
async function load(path:string){const bytes=new Uint8Array(await Bun.file(path).arrayBuffer());return {bytes,source:upgradeFieldEnvelope(importParquetSchema(bytes,{id:path})).target};}
test('Parquet root records keep ordered value slots separate from container and struct definitions',async()=>{
 for(const path of parquetFieldPaths){const {bytes,source}=await load(path),result=classifyParquetRecord(source,{index:0,recordModule:'records',recordId:'root',mode:'strict'});expect(result.status).toBe('classified');const record=result.target!.modules.at(-1)!.elements[0]!;expect(record.kind).toBe('record');expect(record.references!.length).toBe(result.mappings.length-1);
 for(const reference of record.references!){const e=result.target!.modules.find(m=>m.id===reference.module)!.elements.find(e=>e.id===reference.element)!;expect(e.kind).toBe('field');expect(e.cardinality).toBeUndefined();}
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverParquetRecordBytes(receipt,receipt.target!)).toEqual(bytes);}
 }
},30000);
test('Parquet LIST wrappers block; interpreted two-level struct elements supply records',async()=>{
 for(const id of ['list-tuple','list-array','list-items_tuple']){const {source}=await load(`fixtures/parquet/containers/${id}.parquet`);expect(classifyParquetRecord(source,{index:2,recordModule:'records',recordId:'struct',mode:'strict'}).status).toBe('classified');}
 for(const id of ['list-three-element','map-canonical']){const {source}=await load(`fixtures/parquet/containers/${id}.parquet`);for(const index of [1,2])for(const mode of ['strict','report'] as const){const r=classifyParquetRecord(source,{index,recordModule:'records',recordId:'wrapper',mode});expect(r.status).toBe('blocked');expect(r.target).toBeUndefined();}}
});
test('Parquet record conflicts, collisions and receipt edits block atomically',async()=>{
 const {source}=await load('fixtures/parquet/containers/list-three-element.parquet'),field=getParquetFieldMetadata(source).fields[0]!,request={index:0,recordModule:'records',recordId:'root',mode:'strict' as const};
 const author=declareCoreElementKind(source,{module:'parquet.fields',element:field.element.id},'record');for(const mode of ['strict','report'] as const){const r=classifyParquetRecord(author.target,{...request,mode,authors:[author]});expect(r.status).toBe('blocked');expect(r.target).toBeUndefined();}
 const good=declareCoreElementKind(source,{module:'parquet.fields',element:field.element.id},'field');expect(classifyParquetRecord(good.target,{...request,authors:[good]}).status).toBe('classified');expect(classifyParquetRecord(good.target,{...request,authors:[good,good]}).status).toBe('blocked');
 expect(classifyParquetRecord(source,{...request,recordModule:'parquet.fields'}).status).toBe('blocked');expect(()=>classifyParquetRecord(source,{...request,index:999})).toThrow();
 const r=classifyParquetRecord(source,request);r.target!.future=true;expect(()=>recoverParquetRecordBytes(r,r.target!)).toThrow();const altered=classifyParquetRecord(source,request);altered.mappings[0]!.nativePath='/schema/999';expect(()=>recoverParquetRecordBytes(altered,altered.target!)).toThrow();
});
