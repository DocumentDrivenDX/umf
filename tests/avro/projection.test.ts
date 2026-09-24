import {test,expect} from 'bun:test';
import Ajv from 'ajv/dist/2020';
import {importAvroSchema,projectAvroToJsonSchema,exportAvroBundle,importJsonSchema,coreSchema,avroJsonSchemaProjectionSchema} from '../../src';
const policy={id:'avro-document',schemaId:'https://example.test/avro-order',long:'decimal-string',bytes:'hex-string',union:'untagged',lossPolicy:'allow-reported-loss'} as const;
const text=await Bun.file('fixtures/avro/order.avsc').text();
test('US-008-AC1: Avro shapes project with explicit losses and independently validated instances',async()=>{
 const source=importAvroSchema(text,{id:'order'});const result=projectAvroToJsonSchema(source,policy);
 expect(result.status).toBe('projected');expect(result.source).toEqual(source);
 const ajv=new Ajv({strict:false});ajv.addSchema(coreSchema);expect(ajv.compile(avroJsonSchemaProjectionSchema)(result)).toBe(true);
 const validate=ajv.compile(JSON.parse(result.nativeSchema!));
 const datum={id:'9223372036854775807',status:'NEW',token:'00000000',tags:['雪'],labels:{label:'x'},parent:null,amount:'01',created:'1',payload:'00ff',active:true,score:1.5,ratio:2.25,count:1};
 expect(validate(datum)).toBe(true);expect(validate({...datum,parent:datum})).toBe(true);
 for(const change of [{count:2147483648},{token:'00'},{status:'MISSING'},{payload:'FF'},{id:123},{id:'12\n'},{payload:'00\n'}])expect(validate({...datum,...change})).toBe(false);
 const missing={...datum} as any;delete missing.active;expect(validate(missing)).toBe(false);
 expect(validate({...datum,id:'9223372036854775808'})).toBe(true);
 expect(result.issues.map(i=>i.code)).toContain('LONG_ENCODING');
 expect(result.issues.map(i=>i.code)).toContain('LOGICAL_TYPE_UNENFORCED');
 expect(result.issues.map(i=>i.code)).toContain('READER_DEFAULT');
 expect(result.issues.map(i=>i.code)).toContain('UNION_TAGS');
 expect(exportAvroBundle(result.source).schema).toBe(exportAvroBundle(source).schema);
 const targetOnly=importJsonSchema(result.nativeSchema!,{id:'only',baseUri:policy.schemaId});expect(targetOnly.vocabularies['umf.avro']).toBeUndefined();
 await Bun.write('fixtures/avro/document-projection.json',JSON.stringify({result,datum},null,2)+'\n');
});
test('US-008-AC2: strict policy and unresolved interpretation block, dependencies and recursion stay qualified',async()=>{
 const source=importAvroSchema(text,{id:'order'});expect(projectAvroToJsonSchema(source,{...policy,lossPolicy:'strict'}).status).toBe('blocked');
 const base='fixtures/avro/upstream/lang/java/avro/src/test/resources/multipleFile/';
 const schema=await Bun.file(base+'ApplicationEvent.avsc').text();const dep=await Bun.file(base+'DocumentInfo.avsc').text();
 expect(projectAvroToJsonSchema(importAvroSchema(schema,{id:'unresolved'}),policy).status).toBe('blocked');
 const result=projectAvroToJsonSchema(importAvroSchema(schema,{id:'resolved',dependencies:[{id:'doc',schema:dep}]}),policy);
 expect(result.status).toBe('projected');expect(result.mappings.map(m=>m.name)).toEqual(['model.DocumentInfo','model.ApplicationEvent']);
 const validate=new Ajv({strict:false}).compile(JSON.parse(result.nativeSchema!));
 expect(validate({applicationId:'a',status:'NEW',documents:[{documentId:'d',filePath:'p'}]})).toBe(true);
 expect(validate({applicationId:'a',status:'NEW',documents:[{documentId:'d'}]})).toBe(false);
 expect(()=>projectAvroToJsonSchema(source,{...policy,long:'number'} as any)).toThrow();
 const invalid=importAvroSchema('"missing"',{id:'invalid'});expect(projectAvroToJsonSchema(invalid,policy).target).toBeUndefined();
});
test('US-008-AC5: official corpus projections retain sources and validate native targets',async()=>{
 const manifest=await Bun.file('fixtures/avro/upstream/manifest.json').json();const rows=[];
 for(const file of manifest.files){
  const native=await Bun.file('fixtures/avro/upstream/'+file.path).text();const source=importAvroSchema(native,{id:file.path});
  const result=projectAvroToJsonSchema(source,policy);expect(result.source).toEqual(source);
  if(result.status==='projected')expect(()=>new Ajv({strict:false}).compile(JSON.parse(result.nativeSchema!))).not.toThrow();
  else expect(result.issues.some(i=>i.classification==='unsupported')).toBe(true);
  rows.push({path:file.path,status:result.status,issues:result.issues,nativeSchema:result.nativeSchema});
 }
 expect(rows.filter(r=>r.status==='projected').length).toBe(19);
 await Bun.write('fixtures/avro/projection-corpus-results.json',JSON.stringify({commit:manifest.commit,results:rows},null,2)+'\n');
});
