import {createHash} from 'node:crypto';
import {parquetNullabilityProjectionCases} from './nullability-parquet-projection-cases';
import {projectNullabilityToParquet,recoverNullabilityFromParquet} from '../../src/core-ideals/nullability-parquet-projection';
import {classifyParquetNullability,recoverParquetNullabilityBytes} from '../../src/core-ideals/nullability-parquet';
import {parquetAvailabilitySource} from './nullability-parquet-cases';
import {exportParquetCapture} from '../../src/adapters/parquet';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
const rows=[];let idealRecoveries=0,nativeRecoveries=0,classified=0,blocked=0;
for(const c of parquetNullabilityProjectionCases()){
 const result=projectNullabilityToParquet(c.author,c.request);if(result.status!==c.status)throw Error('Unexpected outcome');
 if(!result.target){rows.push({...c,result});blocked++;continue;}
 const bytes=exportParquetCapture(result.target),source=parquetAvailabilitySource(bytes,1);
 const up=classifyParquetNullability(source,{index:1,scope:'row-leaf-value',carrier:'definition-level',mode:'strict'});
 if(!up.target||up.mapping.nullability!==(c.required?'required':'absent-allowed'))throw Error('Unexpected native reclassification');classified++;
 for(const format of ['json','yaml'] as const){
  const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;
  if(JSON.stringify(recoverNullabilityFromParquet(receipt,bytes))!==JSON.stringify(c.author.target))throw Error('Ideal loss');idealRecoveries++;
  const native=readJsonValue(writeJsonValue(copyJson(up),format),format) as unknown as typeof up;
  if(!Buffer.from(recoverParquetNullabilityBytes(native,native.target!)).equals(Buffer.from(bytes)))throw Error('Native loss');nativeRecoveries++;
 }
 const path=`.cache/parquet-nullability-projection/${c.id}.parquet`;await Bun.write(path,bytes);
 rows.push({...c,result,path,bytes:Array.from(bytes)});
}
const paths=['scripts/core-ideals/nullability-parquet-projection-oracle.ts','scripts/core-ideals/nullability-parquet-projection-cases.ts','scripts/core-ideals/nullability-parquet-cases.ts','src/core-ideals/nullability-parquet-projection.ts','src/core-ideals/nullability-parquet.ts','src/core-ideals/parquet-carriers.ts','spec/core/nullability-parquet-projection.schema.json'];
const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/nullability-parquet-projection-corpus.json',JSON.stringify({rows,blocked,classified,idealRecoveries,nativeRecoveries,fingerprints},null,2)+'\n');
const native=Bun.spawn(['.venv/bin/python','scripts/core-ideals/nullability-parquet-projection-native.py'],{stdout:'inherit',stderr:'inherit'});if(await native.exited!==0)throw Error('Native projection validation failed');
console.log(JSON.stringify({cases:rows.length,blocked,classified,idealRecoveries,nativeRecoveries}));
