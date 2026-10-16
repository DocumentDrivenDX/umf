/** Reimport actual generated native artifacts through the existing preservation adapters. */
import assert from 'node:assert/strict';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource} from '../../src/adapters/postgresql';
import {importSqlServerCatalog,exportSqlServerCatalog} from '../../src/adapters/sqlserver';
import {importAvroSchema,exportAvroSchema} from '../../src/adapters/avro';
import {captureParquet,exportParquetCapture} from '../../src/adapters/parquet';
import {inspectParquetMetadata} from '../../src/adapters/parquet/metadata';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {readDocument,writeDocument} from '../../src/model/document';
import {projectBit128Model,recoverBit128ModelProjection} from '../../src/projections/bit128-model';
import {classifyBit128NativeType} from '../../src/projections/bit128';
import {uuidModel} from '../../tests/helpers/uuid-model-fixtures';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import type {Document} from '../../src/model/types';
let recoveries=0;const cases:any[]=[];
const serialized=(doc:Document)=>['json','yaml'].map(format=>readDocument(writeDocument(doc,format as 'json'|'yaml'),format as 'json'|'yaml'));
const equal=(a:unknown,b:unknown)=>assert.equal(canonicalSchemaJson(a),canonicalSchemaJson(b));
for(const system of ['postgresql','sqlserver','avro','parquet','tablespec'])for(const domain of ['uuid','bits128'])for(const kind of system==='tablespec'?[domain==='uuid'?'uuid-text':'hex128-text']:domain==='uuid'?['native-uuid','bytes16','uuid-text','words64']:['bytes16','hex128-text','words64']){
 for(const signed of system==='parquet'&&kind==='words64'?[true,false]:[true]){
 const {logical,binding}=uuidModel(kind,system,domain,signed),projection=projectBit128Model(binding,logical,'report');
 // Authored recovery survives both ordinary envelope serializations of retained sources.
 for(const [l,b] of serialized(logical).map((l,i)=>[l,serialized(binding)[i]!] as const)){const fresh=projectBit128Model(b,l,'report');equal(recoverBit128ModelProjection(fresh,fresh.candidate!.text),{logical,binding});recoveries++;}
 let nativeRecoveries=0,classification:unknown=null;
 if(system==='postgresql'){
  const doc=await importPostgresqlSql(projection.candidate!.text,backend,{id:'native-pg'});
  const exported=await exportPostgresqlSql(doc,backend);
  for(const restored of serialized(doc)){assert.equal(getPostgresqlSource(restored),projection.candidate!.text);assert.equal(await exportPostgresqlSql(restored,backend),exported);nativeRecoveries++;}
 }else if(system==='sqlserver'){
  const capture=(await Bun.file('fixtures/validation/uuid/sqlserver-model-catalogs.json').json()).find((c:any)=>c.domain===domain&&c.kind===kind);assert.ok(capture);
  const doc=importSqlServerCatalog(capture.text,{id:'native-ms'});
  for(const restored of serialized(doc)){equal(JSON.parse(exportSqlServerCatalog(restored)),JSON.parse(capture.text));nativeRecoveries++;}
 }else if(system==='avro'){
  const text=await Bun.file(`fixtures/validation/uuid/model-files/avro-${domain}-${kind}.avsc`).text(),definition=JSON.parse(text),doc=importAvroSchema(text,{id:'native-avro'});
  for(const restored of serialized(doc)){equal(JSON.parse(exportAvroSchema(restored)),definition);nativeRecoveries++;}
  if(kind==='native-uuid'||kind==='uuid-text'){classification=classifyBit128NativeType({system:'avro',version:'1.12.0',definition:definition.fields[0].type});assert.equal((classification as any).scalarType,'uuid');}
 }else if(system==='parquet'){
  const bytes=new Uint8Array(await Bun.file(`fixtures/validation/uuid/model-files/parquet-${domain}-${kind}${!signed?'-unsigned':''}.parquet`).arrayBuffer()),doc=captureParquet(bytes,{id:'native-parquet'});
  for(const restored of serialized(doc)){assert.deepEqual(exportParquetCapture(restored),bytes);nativeRecoveries++;}
  if(kind==='native-uuid'){const field=(inspectParquetMetadata(doc).metadata as any).schema[1];assert.equal(field.type,'7');assert.equal(field.type_length,'16');assert.ok(field.logicalType.UUID);classification=classifyBit128NativeType({system:'parquet',version:'2.11.0',definition:{physicalType:'FIXED_LEN_BYTE_ARRAY',length:16,logicalType:'UUID',nativeField:field}});assert.equal((classification as any).scalarType,'uuid');}
 }else{
  const spec=JSON.parse(projection.candidate!.text).records[1],text=JSON.stringify(spec),doc=importTableSpec(text,{id:'native-tablespec',format:'json'});
  for(const restored of serialized(doc)){assert.equal(exportTableSpec(restored),text);nativeRecoveries++;}
 }
 assert.equal(nativeRecoveries,2);recoveries+=nativeRecoveries;cases.push({system,domain,kind,signed:kind==='words64'?signed:null,authoredRecoveries:2,nativeRecoveries,classification});
 }
}
await Bun.write('fixtures/validation/uuid/native-adapter-roundtrips.json',JSON.stringify({recoveries,cases},null,2)+'\n');console.log({cases:cases.length,recoveries});
