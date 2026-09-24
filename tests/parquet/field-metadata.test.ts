import {test,expect} from 'bun:test';
import {captureParquet,importParquetSchema,getParquetFieldMetadata,exportParquetCapture,renameParquetField,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/parquet/field-metadata.schema.json';
test('CONTRACT-019 core field families respect native logical and physical meanings',async()=>{
 const m=await Bun.file('fixtures/parquet/logical/manifest.json').json(),check=createValidator().compile(schema),expected:Record<string,string|null>={decimal32:'decimal',decimal64:'decimal','decimal-legacy-default':'decimal','decimal-legacy-conflict':'decimal',uint32:'integer',int8:'integer','timestamp-local':'timestamp','time-ms':'time','time-nanos':'time',string:'string',uuid:null,float16:'float',date:'date',interval:null};
 const results=[];
 for(const c of m.cases){
  const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),captured=captureParquet(bytes,{id:c.id}),view=getParquetFieldMetadata(captured);expect(check(view)).toBe(true);expect(view.status).toBe(c.expected);
  if(c.expected==='blocked'){expect(()=>importParquetSchema(bytes,{id:c.id})).toThrow();expect(view.fields).toEqual([]);continue;}
  const doc=importParquetSchema(bytes,{id:c.id});if(Object.hasOwn(expected,c.id))expect(view.fields[0]!.element.scalarType??null).toBe(expected[c.id]??null);
  for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(doc,format),format);expect(getParquetFieldMetadata(back)).toEqual(view);expect(exportParquetCapture(back)).toEqual(bytes);}
  const exported='fixtures/parquet/field-exports/'+c.id+'.parquet';await Bun.write(exported,exportParquetCapture(doc));results.push({id:c.id,path:c.path,exported,view});
 }
 await Bun.write('fixtures/parquet/field-metadata.json',JSON.stringify({results},null,2)+'\n');
});
test('CONTRACT-019 native rename synchronizes materialized fields without losing attachments',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/rename/none.parquet').arrayBuffer()),doc=importParquetSchema(bytes,{id:'rename'}),module=doc.modules.find(m=>m.id==='parquet.fields')!;
 module.elements[0]!.description='Keep annotation';module.elements[0]!.references=[{role:'self',module:'parquet.fields',element:module.elements[0]!.id}];
 const before=getParquetFieldMetadata(doc),renamed=renameParquetField(doc,before.fields[0]!.index,'renamed');expect(renamed.status).toBe('transformed');
 const after=renamed.output!.modules.find(m=>m.id==='parquet.fields')!;expect(after.elements[0]!.name).toBe('renamed');expect(after.elements[0]!.description).toBe('Keep annotation');expect(after.elements[0]!.references).toEqual(module.elements[0]!.references);
 expect(exportParquetCapture(doc)).toEqual(bytes);expect(getParquetFieldMetadata(renamed.output!).fields[0]!.element.name).toBe('renamed');
 await Bun.write('fixtures/parquet/field-exports/renamed.parquet',exportParquetCapture(renamed.output!));
 module.elements[0]!.scalarType='future';expect(()=>exportParquetCapture(doc)).toThrow('disagree');
});
