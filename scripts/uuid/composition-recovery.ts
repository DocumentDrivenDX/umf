// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource} from '../../src/adapters/postgresql';
import {importSqlServerCatalog,exportSqlServerCatalog} from '../../src/adapters/sqlserver';
import {importAvroSchema,exportAvroSchema} from '../../src/adapters/avro';
import {captureParquet,exportParquetCapture} from '../../src/adapters/parquet';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {readDocument,writeDocument} from '../../src/model/document';
import {projectBit128Model,recoverBit128ModelProjection} from '../../src/projections/bit128-model';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
const artifacts=await Bun.file('fixtures/validation/uuid/composition-artifacts.json').json(),ms=await Bun.file('fixtures/validation/uuid/composition-sqlserver.json').json(),cases=[];
const same=(a:unknown,b:unknown)=>assert.equal(canonicalSchemaJson(a),canonicalSchemaJson(b));let total=0;
for(const c of artifacts.cases){let authored=0,native=0;
 for(const format of ['json','yaml'] as const){const source=readDocument(writeDocument(c.logical,format),format),binding=readDocument(writeDocument(c.binding,format),format),r=projectBit128Model(binding,source,'report');same(recoverBit128ModelProjection(r,r.candidate!.text),{logical:c.logical,binding:c.binding});authored++;}
 const schemas=c.system==='postgresql'||c.system==='sqlserver'?[null]:JSON.parse(c.report.candidate.text).records;
 for(const [i,schema] of schemas.entries()){
  if(c.system==='postgresql'){const doc=await importPostgresqlSql(c.report.candidate.text,backend,{id:'composition-native'}),text=await exportPostgresqlSql(doc,backend);for(const f of ['json','yaml'] as const){const d=readDocument(writeDocument(doc,f),f);assert.equal(getPostgresqlSource(d),c.report.candidate.text);assert.equal(await exportPostgresqlSql(d,backend),text);native++;}}
  else if(c.system==='sqlserver'){const text=ms.observations.find((r:any)=>r.stage===c.stage).catalog,doc=importSqlServerCatalog(text,{id:'composition-native'});for(const f of ['json','yaml'] as const){same(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(doc,f),f))),JSON.parse(text));native++;}}
  else if(c.system==='avro'){const text=await Bun.file(`fixtures/validation/uuid/composition-files/${c.stage}/${i}.avsc`).text(),doc=importAvroSchema(text,{id:'composition-native'});for(const f of ['json','yaml'] as const){same(JSON.parse(exportAvroSchema(readDocument(writeDocument(doc,f),f))),JSON.parse(text));native++;}}
  else if(c.system==='parquet'){const bytes=new Uint8Array(await Bun.file(`fixtures/validation/uuid/composition-files/${c.stage}/${i}.parquet`).arrayBuffer()),doc=captureParquet(bytes,{id:'composition-native'});for(const f of ['json','yaml'] as const){assert.deepEqual(exportParquetCapture(readDocument(writeDocument(doc,f),f)),bytes);native++;}}
  else{const text=JSON.stringify(schema),doc=importTableSpec(text,{id:'composition-native',format:'json'});for(const f of ['json','yaml'] as const){assert.equal(exportTableSpec(readDocument(writeDocument(doc,f),f)),text);native++;}}
 }
 total+=authored+native;cases.push({system:c.system,stage:c.stage,authoredRecoveries:authored,nativeRecoveries:native});
}
await Bun.write('fixtures/validation/uuid/composition-recovery.json',JSON.stringify({total,cases},null,2)+'\n');console.log({cases:cases.length,total});
