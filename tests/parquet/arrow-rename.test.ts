import {test,expect} from 'bun:test';
import {importParquetSchema,captureParquet,exportParquetCapture,inspectParquetContainers,renameParquetField,renameParquetFieldWithArrowSchema,getParquetArrowSchema,exportArrowFlatbufferModel,coreSchema,readDocument,writeDocument} from '../../src';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/parquet/arrow-rename.schema.json';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/parquet/arrow-rename/';
test('US-019-AC23 coordinated renames retain data, metadata and reversible field intent',async()=>{
 const cases=[];
 for(const codec of ['none','snappy','gzip']){
  const path=base+codec+'.parquet',bytes=new Uint8Array(await Bun.file(path).arrayBuffer()),source=importParquetSchema(bytes,{id:codec});
  source.vocabularies['example.future']={version:'1.0.0'};source.extensions={'example.future':{keep:true}};source.modules.find(m=>m.id==='parquet.fields')!.elements[0]!['consumer.metadata']={keep:true};
  const tree=inspectParquetContainers(source).tree!,fields:any[]=[];const visit=(n:any)=>{fields.push(n);n.children.forEach(visit);};visit(tree);
  for(const [components,arrowFieldPath] of [[['detail'],[0]],[['detail','code'],[0,0]],[['detail','qty'],[0,1]],[['events'],[1]],[['elapsed'],[2]],[['created'],[3]]] as [string[],number[]][]){
   const index=fields.find(f=>JSON.stringify(f.path)===JSON.stringify(components)).index,policy={parquetIndex:index,arrowFieldPath,name:'renamed.注文',uninterpretedMetadata:'preserve-and-report' as const},before=structuredClone(source);
   expect(renameParquetField(source,index,policy.name).status).toBe('blocked');
   const result=renameParquetFieldWithArrowSchema(source,policy,flatbufferBackend);expect(result.status).toBe('transformed');expect(check(result)).toBe(true);expect(source).toEqual(before);expect(result.source).toEqual(source);expect(result.output!.extensions).toEqual(source.extensions);
   const output=exportParquetCapture(result.output!);expect(output.subarray(0,result.unchangedPrefixBytes)).toEqual(bytes.subarray(0,result.unchangedPrefixBytes));
   expect(result.output!.modules.find(m=>m.id==='parquet.fields')!.elements[0]!['consumer.metadata']).toEqual({keep:true});
   expect(result.diagnostics.some(d=>d.code==='PARQUET_ARROW_NAME_REFERENCES_UNVERIFIED')).toBe(true);
   for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(result.output!,format),format);expect(exportParquetCapture(back)).toEqual(output);expect(getParquetArrowSchema(back)).toEqual(getParquetArrowSchema(result.output!));}
   const reverse=renameParquetFieldWithArrowSchema(result.output!,{...policy,name:components.at(-1)!},flatbufferBackend);expect(reverse.status).toBe('transformed');expect(exportArrowFlatbufferModel(getParquetArrowSchema(reverse.output!).schema!)).toBe(exportArrowFlatbufferModel(getParquetArrowSchema(source).schema!));
   const id=codec+'-'+index,outputPath=base+'exports/'+id+'.parquet',restoredPath=base+'restored/'+id+'.parquet';await Bun.write(outputPath,output);await Bun.write(restoredPath,exportParquetCapture(reverse.output!));
   cases.push({id,path,source,policy,result,outputPath,restoredPath,sha256:new Bun.CryptoHasher('sha256').update(output).digest('hex'),restoredSha256:new Bun.CryptoHasher('sha256').update(exportParquetCapture(reverse.output!)).digest('hex')});
  }
 }
 await Bun.write(base+'results.json',JSON.stringify({cases},null,2)+'\n');
},60000);
test('US-019-AC23 missing correspondence and invalid policies cannot produce partial files',async()=>{
 const bytes=new Uint8Array(await Bun.file(base+'none.parquet').arrayBuffer()),source=captureParquet(bytes,{id:'guards'}),policy={parquetIndex:1,arrowFieldPath:[0],name:'new',uninterpretedMetadata:'preserve-and-report' as const};
 for(const changes of [{arrowFieldPath:[9]},{arrowFieldPath:[1]},{name:'events'},{name:''},{name:'\ud800'},{name:'detail'}]){const result=renameParquetFieldWithArrowSchema(source,{...policy,...changes},flatbufferBackend);expect(result.status).toBe('blocked');expect(result.output).toBeUndefined();expect(check(result)).toBe(true);expect(result.source).toEqual(source);}
 const absent=captureParquet(new Uint8Array(await Bun.file('fixtures/parquet/arrow-schema/physical-only.parquet').arrayBuffer()),{id:'absent'});expect(renameParquetFieldWithArrowSchema(absent,policy,flatbufferBackend).status).toBe('blocked');
 expect(()=>renameParquetFieldWithArrowSchema(source,{...policy,uninterpretedMetadata:'discard'} as any,flatbufferBackend)).toThrow();
 expect(()=>renameParquetFieldWithArrowSchema(source,{...policy,arrowFieldPath:[]} as any,flatbufferBackend)).toThrow();
 expect(exportParquetCapture(source)).toEqual(bytes);
});
