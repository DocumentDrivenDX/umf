import {test,expect} from 'bun:test';
import {captureParquet,importParquetSchema,exportParquetCapture,projectParquetToAvro,readDocument,writeDocument,exportAvroSchema,decodeParquetFooter,encodeParquetWire,coreSchema,type ParquetAvroPolicy} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/projections/parquet-avro.schema.json';
const policy:ParquetAvroPolicy={id:'avro',recordName:'ParquetRecord',namespace:'example.parquet',fieldNames:{},maps:'entry-arrays',lossPolicy:'allow-reported-loss'};
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
test('CONTRACT-035 nested Parquet shapes preserve nullable lists, map entries and scalar precision in Avro',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/avro/nested.parquet').arrayBuffer()),source=importParquetSchema(bytes,{id:'nested'}),r=projectParquetToAvro(source,policy);
 expect(r.status).toBe('projected');expect(check(r)).toBe(true);expect(r.source).toEqual(source);
 const native=JSON.parse(r.nativeSchema!),field=(name:string)=>native.fields.find((f:any)=>f.name===name);
 expect(field('id').type).toBe('long');expect(field('unsigned').type[1]).toEqual({type:'bytes',logicalType:'decimal',precision:20,scale:0});expect(field('amount').type[1].precision).toBe(20);
 expect(field('items').type[1]).toEqual({type:'array',items:['null','int']});expect(field('lookup').type[1].items.fields).toEqual([{name:'key',type:'int'},{name:'value',type:['null','string']}]);
 expect(field('matrix').type[1].items[1]).toEqual({type:'array',items:['null','long']});expect(field('stamp').type[1].logicalType).toBe('timestamp-nanos');expect(field('clock').type[1]).toBe('long');
 const exports=[];for(const format of ['json','yaml'] as const){const text=exportAvroSchema(readDocument(writeDocument(r.target!,format),format));expect(JSON.parse(text)).toEqual(native);expect(exportParquetCapture(readDocument(writeDocument(r.source,format),format))).toEqual(bytes);exports.push({format,schema:text});}
 const strict=projectParquetToAvro(source,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(check(strict)).toBe(true);
 await Bun.write('fixtures/parquet/avro/projection.json',JSON.stringify({policy,result:r,exports},null,2)+'\n');
 const bad=structuredClone(source);bad.modules.find(m=>m.id==='parquet.fields')!.elements[0]!.scalarType='float';expect(()=>projectParquetToAvro(bad,policy)).toThrow('disagree');
 expect(projectParquetToAvro(source,{...policy,fieldNames:{'9999':'absent'}}).status).toBe('blocked');expect(()=>projectParquetToAvro(source,{...policy,maps:'map'} as any)).toThrow('policy');
 const renamed=projectParquetToAvro(source,{...policy,fieldNames:{'1':'renamed'}});expect(JSON.parse(renamed.nativeSchema!).fields[0].name).toBe('renamed');
 expect(projectParquetToAvro(source,{...policy,fieldNames:{'1':'unsigned'}}).status).toBe('blocked');
});
test('CONTRACT-035 logical and legacy container corpora lower or report blocked source shapes',async()=>{
 const cases=[];
 for(const family of ['logical','containers'])for(const c of (await Bun.file('fixtures/parquet/'+family+'/manifest.json').json()).cases){
  const doc=captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:family+'-'+c.id}),r=projectParquetToAvro(doc,policy);expect(check(r)).toBe(true);
  expect(r.status).toBe(c.expected==='blocked'?'blocked':'projected');
  if(family==='containers'&&r.status==='projected'){
   const field=JSON.parse(r.nativeSchema!).fields[0],nullable=Array.isArray(field.type),type=nullable?field.type[1]:field.type;
   expect(nullable).toBe(c.native.nullable);
   const shape=(t:any):any=>typeof t==='string'?{kind:({int:'int32',long:'int64'} as any)[t]??t}:t.type==='array'?{kind:'list',elementNullable:Array.isArray(t.items),element:shape(Array.isArray(t.items)?t.items[1]:t.items)}:t.type==='record'?{kind:'struct',fields:t.fields.map((f:any)=>({name:f.name,nullable:Array.isArray(f.type),type:shape(Array.isArray(f.type)?f.type[1]:f.type)}))}:null;
   if(c.id.startsWith('list-'))expect(shape(type)).toEqual(c.native.type);
   else{expect(type.type).toBe('array');expect(type.items.fields[0].type).toBe('int');if(c.id==='map-key-only')expect(type.items.fields[1].type).toBe('null');else expect(Array.isArray(type.items.fields[1].type)).toBe(c.native.type.valueNullable);}
  }
  if(r.status==='projected'){expect(JSON.parse(exportAvroSchema(readDocument(writeDocument(r.target!,'json'),'json')))).toEqual(JSON.parse(r.nativeSchema!));}
  cases.push({family,id:c.id,source:c.path,status:r.status,nativeSchema:r.nativeSchema,issues:r.issues});
 }
 expect(cases.filter(c=>c.status==='projected').length).toBe(26);
 await Bun.write('fixtures/parquet/avro/corpus.json',JSON.stringify({cases},null,2)+'\n');
});
test('CONTRACT-035 unknown native fields on normalized-away LIST wrappers still block lowering',async()=>{
 const source=captureParquet(new Uint8Array(await Bun.file('fixtures/parquet/containers/list-three-element.parquet').arrayBuffer()),{id:'unknown-wrapper'}),wire=decodeParquetFooter(source).value!;
 if(wire.kind!=='struct')throw Error('Expected footer');const list=wire.fields.find(f=>f.id===2)!.value;if(list.kind!=='list')throw Error('Expected schema');const wrapper=list.items[2]!;if(wrapper.kind!=='struct')throw Error('Expected wrapper');wrapper.fields.push({id:777,value:{kind:'binary',hex:'ab'}});
 const footer=encodeParquetWire(wire),bytes=new Uint8Array(footer.length+12);bytes.set([80,65,82,49]);bytes.set(footer,4);new DataView(bytes.buffer).setUint32(bytes.length-8,footer.length,true);bytes.set([80,65,82,49],bytes.length-4);
 const captured=captureParquet(bytes,{id:'unknown-wrapper'}),r=projectParquetToAvro(captured,policy);expect(r.status).toBe('blocked');expect(check(r)).toBe(true);expect(r.issues.some(i=>i.path==='/schema/2'&&i.code==='PARQUET_AVRO_UNSUPPORTED')).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);
});
