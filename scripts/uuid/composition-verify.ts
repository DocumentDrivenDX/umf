// SPDX-License-Identifier: MIT OR Apache-2.0
import {decodeBit128Record} from '../../src/extensions/binding/bit128-record';
import assert from 'node:assert/strict';
import {decodeBit128FileRecord} from '../../src/projections/bit128-file-values';
import {validateBit128Dataset} from '../../src/extensions/binding/model-dataset';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
const artifacts=await Bun.file('fixtures/validation/uuid/composition-artifacts.json').json();let rows=0,refusals=0,nativeInvalidRefusals=0;
for(const target of ['postgresql','sqlserver','files','tablespec']){
 const evidence=await Bun.file('fixtures/validation/uuid/composition-'+target+'.json').json();
 for(const observation of evidence.observations){const c=artifacts.cases.find((c:any)=>c.system===observation.system&&c.stage===observation.stage);assert.ok(c);
  const runs=target==='files'?(observation.system==='avro'?['apache','fastavro']:['pyarrow']):['native'];
  for(const engine of runs){for(const r of observation.records){const invalid=target==='files'?r.engines.find((e:any)=>e.engine===engine).invalidRows:target==='tablespec'?r.invalidRows:[];for(const row of invalid??[]){assert.throws(()=>decodeBit128FileRecord(c.binding,c.logical,r.record,row));nativeInvalidRefusals++;}}const data=observation.records.map((r:any)=>({record:r.record,rows:target==='postgresql'||target==='sqlserver'?r.rows:(target==='files'?r.engines.find((e:any)=>e.engine===engine).rows:r.rows).map((row:any)=>decodeBit128FileRecord(c.binding,c.logical,r.record,row))}));
   const checked=validateBit128Dataset(c.binding,c.logical,data);rows+=checked.reduce((n:any,r:any)=>n+r.rows.length,0);
   // Regenerate expected logical rows from independently native-returned token rows only for SQL;
   // file expected values use authored source data and native file observations.
   const expected=c.records.map((r:any)=>({record:r.record,rows:r.rows.map((row:any)=>['postgresql','sqlserver'].includes(c.system)?decodeBit128Record(c.binding,c.logical,r.record,row):decodeBit128FileRecord(c.binding,c.logical,r.record,row))}));
   const unordered=(data:any[])=>data.map(r=>({record:r.record,rows:r.rows.map((row:any)=>canonicalSchemaJson(row)).sort()})).sort((a,b)=>canonicalSchemaJson(a.record).localeCompare(canonicalSchemaJson(b.record)));assert.equal(canonicalSchemaJson(unordered(checked)),canonicalSchemaJson(unordered(expected)));
   const duplicate=structuredClone(data);duplicate[0].rows.push(duplicate[0].rows[0]);assert.throws(()=>validateBit128Dataset(c.binding,c.logical,duplicate));refusals++;
  }
 }
}
await Bun.write('fixtures/validation/uuid/composition-returned.json',JSON.stringify({rows,refusals,nativeInvalidRefusals,allNativeReturnedDatasetsValidated:true},null,2)+'\n');console.log({rows,refusals,nativeInvalidRefusals});
