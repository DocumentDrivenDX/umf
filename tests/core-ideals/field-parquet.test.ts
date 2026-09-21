import {test,expect} from 'bun:test';
import {parquetFieldPaths} from '../../scripts/core-ideals/parquet-field-cases';
import {classifyParquetField,recoverParquetFieldBytes} from '../../src/core-ideals/parquet-field';
import {importParquetSchema,getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
async function load(path:string){const bytes=new Uint8Array(await Bun.file(path).arrayBuffer());return {bytes,source:upgradeFieldEnvelope(importParquetSchema(bytes,{id:path})).target};}
test('Parquet leaves retain repetition and exact native bytes; groups cannot become primitive Fields',async()=>{
 let repeated=0,groups=0;
 for(const path of parquetFieldPaths){const {bytes,source}=await load(path);for(const f of getParquetFieldMetadata(source).fields)for(const mode of ['strict','report'] as const){
 const result=classifyParquetField(source,{index:f.index,mode});
 if(!Object.hasOwn(f.nativeField as object,'type')){expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.residuals.length).toBe(1);groups++;continue;}
 expect(result.status).toBe('classified');expect(result.mapping.nativePath).toBe('/schema/'+f.index);expect(result.mapping.nativeFragment).toEqual(f.nativeField);
 const selected=result.target!.modules.find(m=>m.id==='parquet.fields')!.elements.find(e=>e.id===f.element.id)!;expect(selected.kind).toBe('field');expect(selected.cardinality).toBeUndefined();expect(selected.nullability).toBeUndefined();
 expect(getParquetFieldMetadata(result.target!).fields).toEqual(getParquetFieldMetadata(source).fields);if(f.repetitionLevel>0)repeated++;
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverParquetFieldBytes(receipt,receipt.target!)).toEqual(bytes);}
 }}expect(repeated).toBeGreaterThan(0);expect(groups).toBeGreaterThan(0);
},30000);
test('Parquet rejects unknown indices, invalid topology, conflicts and stale recovery',async()=>{
 const {source}=await load('fixtures/parquet/logical/uuid.parquet'),f=getParquetFieldMetadata(source).fields[0]!,request={index:f.index,mode:'strict' as const};
 expect(()=>classifyParquetField(source,{...request,index:0})).toThrow();expect(()=>classifyParquetField(source,{...request,index:9999})).toThrow();
 const good=declareCoreElementKind(source,{module:'parquet.fields',element:f.element.id},'field');expect(classifyParquetField(good.target,{...request,author:good}).status).toBe('classified');
 const wrong=declareCoreElementKind(source,{module:'parquet.fields',element:f.element.id},'record');for(const mode of ['strict','report'] as const){expect(classifyParquetField(wrong.target,{...request,mode,author:wrong}).status).toBe('blocked');expect(classifyParquetField(good.target,{...request,mode}).status).toBe('blocked');}
 const result=classifyParquetField(source,request);result.target!.future=true;expect(()=>recoverParquetFieldBytes(result,result.target!)).toThrow();
 const tampered=classifyParquetField(source,request);tampered.mapping.nativePath='/schema/999';expect(()=>recoverParquetFieldBytes(tampered,tampered.target!)).toThrow();
 const missing=classifyParquetField(source,request);delete (missing as any).diagnostics;expect(()=>recoverParquetFieldBytes(missing,missing.target!)).toThrow();
 const edited=structuredClone(source);edited.modules.find(m=>m.id==='parquet.fields')!.elements[0]!.name='changed';expect(()=>classifyParquetField(edited,request)).toThrow();
 for(const id of ['list-two-children','map-nullable-key','map-repeated-value']){const bad=await load(`fixtures/parquet/containers/${id}.parquet`);for(const mode of ['strict','report'] as const)expect(()=>classifyParquetField(bad.source,{index:1,mode})).toThrow();}
});
