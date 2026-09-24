import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,getParquetArrowSchema,exportArrowFlatbufferModel,appendParquetKeyValueMetadata,decodeParquetFooter,coreSchema,readDocument,writeDocument} from '../../src';
import {rewriteParquetFooter} from '../../src/adapters/parquet/rewrite';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/parquet/arrow-schema.schema.json';
import {encodeArrowFlatbuffer,proposeArrowFlatbufferEdit} from '../../src';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
const load=async(path:string)=>captureParquet(new Uint8Array(await Bun.file(path).arrayBuffer()),{id:path});
test('CONTRACT-019 embedded Arrow schema preserves meanings absent from physical Parquet',async()=>{
 const oracle=await Bun.file('fixtures/parquet/arrow-schema/native.json').json(),cases=[];
 for(const c of oracle.cases){
  const source=await load(c.path),before=exportParquetCapture(source),r=getParquetArrowSchema(source);
  expect(check(r)).toBe(true);expect(r.status).toBe(c.stored?'decoded':'absent');expect(r.complete).toBe(false);expect(r.source).toEqual(source);expect(exportParquetCapture(source)).toEqual(before);
  if(c.stored){
   expect(r.ipcHex).toBe(c.ipcHex);const model=JSON.parse(exportArrowFlatbufferModel(r.schema!));
   expect(model.value.fields.map((f:any)=>f.type.type)).toEqual(['LargeList','Duration','Timestamp','Utf8']);
   expect(model.value.fields[2].type.value.timezone).toBe('America/New_York');expect(model.value.fields[3].custom_metadata).toEqual([{key:'future.field',value:'preserve'}]);expect(model.value.custom_metadata).toEqual([{key:'future.schema',value:'preserve'}]);
   expect(r.diagnostics.some(d=>d.code==='PARQUET_ARROW_CORRESPONDENCE_UNVERIFIED')).toBe(true);
  }
  for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(source,format),format);expect(getParquetArrowSchema(back)).toEqual(r);if(r.schema)expect(exportArrowFlatbufferModel(readDocument(writeDocument(r.schema,format),format))).toBe(exportArrowFlatbufferModel(r.schema));}
  cases.push({id:c.stored?'stored':'absent',source,result:r});
 }
 await Bun.write('fixtures/parquet/arrow-schema/results.json',JSON.stringify({cases},null,2)+'\n');
});
test('CONTRACT-019 embedded schema rejects ambiguity and malformed framing without losing source',async()=>{
 const base=await load('fixtures/parquet/arrow-schema/physical-only.parquet'),native=await Bun.file('fixtures/parquet/arrow-schema/native.json').json(),hex=native.cases[0].ipcHex as string,bytes=Buffer.from(hex,'hex'),encoded=bytes.toString('base64');
 const embedded=(value?:string)=>appendParquetKeyValueMetadata(base,[{key:'ARROW:schema',...(value===undefined?{}:{value})}]).output!;
 const truncated=bytes.subarray(0,-1),trailing=Buffer.concat([bytes,Buffer.alloc(8)]),badLength=Buffer.from(bytes);badLength.writeInt32LE(-4,4);
 const controls:[string,string|undefined][]=[['missing',undefined],['empty',''],['invalid','!!!'],['whitespace',encoded+'\n'],['unpadded',encoded.replace(/=+$/,'')],['truncated',truncated.toString('base64')],['trailing',trailing.toString('base64')],['negative-length',badLength.toString('base64')],['no-message',Buffer.alloc(8).toString('base64')]];
 const originalMessage=getParquetArrowSchema(await load('fixtures/parquet/arrow-schema/stored.parquet')).message!;
 const bodyModel=JSON.parse(exportArrowFlatbufferModel(originalMessage));bodyModel.value.bodyLength='1';
 const {importArrowFlatbufferModel}=await import('../../src');
 const badBodyMetadata=encodeArrowFlatbuffer(importArrowFlatbufferModel(JSON.stringify(bodyModel),{id:'bad-body'}),flatbufferBackend),bodyFrame=Buffer.alloc(8+Math.ceil(badBodyMetadata.length/8)*8);bodyFrame.writeInt32LE(-1,0);bodyFrame.writeInt32LE(bodyFrame.length-8,4);bodyFrame.set(badBodyMetadata,8);controls.push(['body-bearing-schema',bodyFrame.toString('base64')]);
 const cases=[];
 for(const [id,value] of controls){if(id==='unpadded'&&value===encoded)continue;const source=embedded(value),result=getParquetArrowSchema(source);expect(check(result)).toBe(true);expect(result.status).toBe('blocked');expect(result.schema).toBeUndefined();expect(result.source).toEqual(source);cases.push({id,source,result});}
 const legacy=Buffer.concat([bytes.subarray(4,8),bytes.subarray(8)]),legacySource=embedded(legacy.toString('base64')),legacyResult=getParquetArrowSchema(legacySource);expect(legacyResult.status).toBe('decoded');expect(check(legacyResult)).toBe(true);cases.push({id:'legacy-prefix',source:legacySource,result:legacyResult});
 const source=embedded(encoded),tree=decodeParquetFooter(source).value!;if(tree.kind!=='struct')throw Error();const kv=tree.fields.find(f=>f.id===5)!.value;if(kv.kind!=='list')throw Error();kv.items.push(structuredClone(kv.items.find((x:any)=>x.fields?.some((f:any)=>f.id===1&&f.value.hex===Buffer.from('ARROW:schema').toString('hex')))!));
 const duplicate=rewriteParquetFooter(source,tree).output,result=getParquetArrowSchema(duplicate);expect(result.status).toBe('blocked');expect(result.diagnostics.at(-1)!.message).toContain('Duplicate');expect(check(result)).toBe(true);cases.push({id:'duplicate',source:duplicate,result});
 await Bun.write('fixtures/parquet/arrow-schema/boundaries.json',JSON.stringify({cases},null,2)+'\n');
},30000);

test('CONTRACT-019 extracted Arrow messages re-encode and support detached schema transforms',async()=>{
 const source=await load('fixtures/parquet/arrow-schema/stored.parquet'),observed=getParquetArrowSchema(source),outputs=[];
 for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(observed.message!,format),format);
  for(const edited of [false,true]){
   const document=edited?proposeArrowFlatbufferEdit(restored,'/value/header/value/fields/0/name','renamed_events').document:restored;
   const metadata=encodeArrowFlatbuffer(document,flatbufferBackend),padded=Math.ceil(metadata.length/8)*8,bytes=new Uint8Array(8+padded),view=new DataView(bytes.buffer);view.setInt32(0,-1,true);view.setInt32(4,padded,true);bytes.set(metadata,8);
   expect(JSON.parse(exportArrowFlatbufferModel(document)).value.header.value.fields[0].name).toBe(edited?'renamed_events':'events');
   outputs.push({format,edited,ipcHex:Buffer.from(bytes).toString('hex')});
  }
 }
 expect(getParquetArrowSchema(source)).toEqual(observed);
 await Bun.write('fixtures/parquet/arrow-schema/reencoded.json',JSON.stringify({outputs,scope:'Detached embedded Arrow schema transformation only; source Parquet is unchanged.'},null,2)+'\n');
});
