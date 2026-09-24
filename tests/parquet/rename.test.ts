import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,renameParquetField,inspectParquetContainers,appendParquetKeyValueMetadata,parquetRenameSchema,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const validate=ajv.compile(parquetRenameSchema);
const load=async(path:string)=>captureParquet(new Uint8Array(await Bun.file(path).arrayBuffer()),{id:'test'});
test('US-019-AC11: rename every field in nested native files with exact data-prefix preservation',async()=>{
 const report=await Bun.file('fixtures/parquet/rename/results.json').json();expect(report.results).toHaveLength(49);
 for(const c of report.results){const source=await load(c.path),bytes=exportParquetCapture(source),before=JSON.stringify(source),r=renameParquetField(source,c.index,c.name);expect(r.status).toBe(c.status);expect(validate(r)).toBe(true);expect(JSON.stringify(source)).toBe(before);expect(r.source).toEqual(source);expect(r.complete).toBe(false);
  if(r.output){const output=exportParquetCapture(r.output);expect(output.subarray(0,r.unchangedPrefixBytes)).toEqual(bytes.subarray(0,r.unchangedPrefixBytes));expect(new Bun.CryptoHasher('sha256').update(output).digest('hex')).toBe(c.sha256);expect(r.rename).toEqual(c.rename);const back=renameParquetField(r.output,c.index,c.rename.from.at(-1));expect(back.status).toBe('transformed');expect(new Bun.CryptoHasher('sha256').update(exportParquetCapture(back.output!)).digest('hex')).toBe(c.roundtripSha256);expect(inspectParquetContainers(r.output).containers).toEqual(inspectParquetContainers(source).containers);}
  else expect(r.output).toBeUndefined();
 }
},30000);
test('US-019-AC11: reject semantic wrapper changes, collisions, stale metadata and invalid requests',async()=>{
 const source=await load('fixtures/parquet/rename/none.parquet');
 for(const [index,name] of [[0,'root'],[-1,'bad'],[1000,'bad'],[1,'detail'],[1,'order'],[1,''],[1,'\ud800'],[1,'x'.repeat(100001)]] as [number,string][]){const r=renameParquetField(source,index,name);expect(r.status).toBe('blocked');expect(r.output).toBeUndefined();expect(validate(r)).toBe(true);expect(r.source).toEqual(source);}
 const appended=appendParquetKeyValueMetadata(source,[{key:'custom.schema.reference',value:'order'}]);expect(appended.status).toBe('transformed');expect(renameParquetField(appended.output!,1,'new').status).toBe('blocked');
 for(const [id,index,name] of [['list-array',2,'wrapper'],['list-items_tuple',1,'other'],['list-three-element',2,'array']] as [string,number,string][]){const original=await load('fixtures/parquet/containers/'+id+'.parquet'),r=renameParquetField(original,index,name);expect(r.status).toBe('blocked');expect(r.diagnostics.at(-1)!.message).toContain('interpretation');expect(r.output).toBeUndefined();expect(r.source).toEqual(original);}
 const tuple=await load('fixtures/parquet/containers/list-array.parquet');expect(renameParquetField(tuple,3,'new').status).toBe('transformed');
 const embedded=await load('fixtures/parquet/rename/embedded-schema.parquet');expect(renameParquetField(embedded,1,'new').diagnostics.at(-1)!.message).toContain('schema references');
});
