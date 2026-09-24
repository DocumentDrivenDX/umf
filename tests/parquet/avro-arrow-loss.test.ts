import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,projectParquetToAvro,projectToTableSpecViaAvro,writeDocument,readDocument,coreSchema,type ParquetAvroPolicy} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/projections/parquet-avro.schema.json';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/parquet/arrow-schema/',policy:ParquetAvroPolicy={id:'arrow-loss',recordName:'Sample',namespace:'example',fieldNames:{},maps:'entry-arrays',lossPolicy:'allow-reported-loss'};
test('CONTRACT-035 Arrow refinements require explicit losses even when physical Avro schemas agree',async()=>{
 const cases=[];
 for(const file of ['stored.parquet','physical-only.parquet']){
  const bytes=new Uint8Array(await Bun.file(base+file).arrayBuffer()),source=captureParquet(bytes,{id:file}),result=projectParquetToAvro(source,policy);
  expect(result.status).toBe('projected');expect(check(result)).toBe(true);expect(exportParquetCapture(result.source)).toEqual(bytes);
  const codes=result.issues.map(i=>i.code),stored=file==='stored.parquet';
  for(const code of ['EMBEDDED_ARROW_SCHEMA_NOT_PROJECTED','ARROW_DURATION_NOT_PROJECTED','ARROW_TIMEZONE_NOT_PROJECTED','ARROW_LIST_REFINEMENT_NOT_PROJECTED'])expect(codes.includes(code)).toBe(stored);
  for(const issue of result.issues.filter(i=>i.code.startsWith('ARROW_')))expect(issue.path).toMatch(/^\/key_value_metadata\/\d+\/value$/);
  for(const format of ['json','yaml'] as const)expect(projectParquetToAvro(readDocument(writeDocument(source,format),format),policy)).toEqual(result);
  expect(projectParquetToAvro(source,{...policy,lossPolicy:'strict'}).status).toBe('blocked');cases.push({file,source,policy,result});
 }
 expect(cases[0]!.result.nativeSchema).toBe(cases[1]!.result.nativeSchema);
 const chain=projectToTableSpecViaAvro(cases[0]!.source,{sourceKind:'parquet',toAvro:policy,toTableSpec:{id:'table',tableName:'Sample',fields:{events:{name:'events',representation:'json-text'},elapsed:{name:'elapsed',representation:'json-text'},created:{name:'created',representation:'timestamp'},label:{name:'label',representation:'string'}},lossPolicy:'allow-reported-loss'}});
 expect(chain.status).toBe('projected');expect(chain.issues.some(i=>i.stage==='sourceToAvro'&&i.issue.code==='ARROW_DURATION_NOT_PROJECTED')).toBe(true);
 await Bun.write(base+'avro-losses.json',JSON.stringify({cases,chain},null,2)+'\n');
});
test('CONTRACT-035 malformed or ambiguous Arrow metadata blocks physical-only projection',async()=>{
 const fixture=await Bun.file(base+'boundaries.json').json();let blocked=0;
 for(const c of fixture.cases){const result=projectParquetToAvro(c.source,policy);expect(check(result)).toBe(true);expect(result.source).toEqual(c.source);
  if(c.result.status==='blocked'){expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.issues.some(i=>i.code==='EMBEDDED_ARROW_SCHEMA_UNINTERPRETED')).toBe(true);blocked++;}
  else expect(result.status).toBe('projected');
 }
 expect(blocked).toBeGreaterThan(0);
});
