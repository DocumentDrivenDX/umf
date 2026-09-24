import {test,expect} from 'bun:test';
import {importParquetSchema,exportParquetCapture,inspectParquetContainers,renameParquetFieldWithArrowSchema,coreSchema,readDocument,writeDocument} from '../../src';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/parquet/arrow-rename.schema.json';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/parquet/arrow-nested/';
test('US-019-AC23 structural LIST/MAP correspondence retains distinct labels and inverse meaning',async()=>{
 const path=base+'nested.parquet',bytes=new Uint8Array(await Bun.file(path).arrayBuffer()),source=importParquetSchema(bytes,{id:'nested'}),physical=inspectParquetContainers(source),nodes:any[]=[];const visit=(n:any)=>{nodes.push(n);n.children.forEach(visit);};visit(physical.tree!);
 const cases=[];
 const choices:[string[],number[],string?][]=[
  [['items','list','element','code'],[0,0,0]],
  [['items','list','element','qty'],[0,0,1]],
  [['lookup','key_value','value','code'],[1,0,1,0]],
  [['lookup','key_value','value','qty'],[1,0,1,1]],
  [['items','list','element'],[0,0],'physical_record'],
 ];
 for(const [components,arrowFieldPath,parquetName] of choices){
  const index=nodes.find(n=>JSON.stringify(n.path)===JSON.stringify(components)).index,policy={parquetIndex:index,arrowFieldPath,name:'renamed',...(parquetName?{parquetName}:{}),uninterpretedMetadata:'preserve-and-report' as const};
  const result=renameParquetFieldWithArrowSchema(source,policy,flatbufferBackend);expect(check(result)).toBe(true);expect(result.status).toBe('transformed');expect(result.rename!.parquetFrom).toEqual(components);expect(result.source).toEqual(source);
  const output=exportParquetCapture(result.output!);expect(output.subarray(0,result.unchangedPrefixBytes)).toEqual(bytes.subarray(0,result.unchangedPrefixBytes));
  for(const format of ['json','yaml'] as const)expect(exportParquetCapture(readDocument(writeDocument(result.output!,format),format))).toEqual(output);
  const inversePolicy={...policy,name:result.rename!.from.at(-1)!,parquetName:components.at(-1)!},reverse=renameParquetFieldWithArrowSchema(result.output!,inversePolicy,flatbufferBackend);expect(reverse.status).toBe('transformed');
  const id='nested-'+index,outputPath=base+'exports/'+id+'.parquet',restoredPath=base+'restored/'+id+'.parquet';await Bun.write(outputPath,output);await Bun.write(restoredPath,exportParquetCapture(reverse.output!));
  cases.push({id,path,source,policy,result,inversePolicy,outputPath,restoredPath,sha256:new Bun.CryptoHasher('sha256').update(output).digest('hex'),restoredSha256:new Bun.CryptoHasher('sha256').update(exportParquetCapture(reverse.output!)).digest('hex')});
 }
 const sample=cases[0]!;
 for(const policy of [{...sample.policy,parquetIndex:sample.policy.parquetIndex+1},{...sample.policy,arrowFieldPath:[0,1]},{...sample.policy,name:'qty'}]){const r=renameParquetFieldWithArrowSchema(source,policy,flatbufferBackend);expect(r.status).toBe('blocked');expect(r.output).toBeUndefined();}
 const entry=nodes.find(n=>JSON.stringify(n.path)===JSON.stringify(['lookup','key_value']));expect(renameParquetFieldWithArrowSchema(source,{...sample.policy,parquetIndex:entry.index,arrowFieldPath:[1,0]},flatbufferBackend).status).toBe('blocked');
 for(const [components,arrowFieldPath] of [[['lookup','key_value','key'],[1,0,0]],[['lookup','key_value','value'],[1,0,1]]] as [string[],number[]][]){const n=nodes.find(n=>JSON.stringify(n.path)===JSON.stringify(components));const r=renameParquetFieldWithArrowSchema(source,{...sample.policy,parquetIndex:n.index,arrowFieldPath},flatbufferBackend);expect(r.status).toBe('blocked');expect(r.output).toBeUndefined();}
 await Bun.write(base+'results.json',JSON.stringify({cases},null,2)+'\n');
},60000);
