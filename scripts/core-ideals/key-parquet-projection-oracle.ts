import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parquetKeyProjectionCases} from './key-parquet-projection-cases';
import {projectKeysToParquet,recoverKeysParquetIdeal} from '../../src/core-ideals/key-parquet-projection';
import {exportParquetCapture} from '../../src/adapters/parquet';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';
const rows=[];
for(const c of parquetKeyProjectionCases()){
 const r=projectKeysToParquet(c.source,c.authors,c.request);assert.equal(r.status,c.expected,c.name);if(r.status==='blocked')continue;
 const bytes=exportParquetCapture(r.target!),path='fixtures/parquet/keys/projected-'+c.name+'.parquet';await Bun.write(path,bytes);assert.deepEqual(recoverKeysParquetIdeal(r,importParquetSchema(bytes,{id:c.request.id})),c.source);
 rows.push({name:c.name,path,request:c.request,mappings:r.mappings,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await Bun.write('fixtures/validation/key-parquet-projection-corpus.json',JSON.stringify({scope:'Independently generated empty Parquet schema files; per-key identity residuals stay in UMF receipts',rows},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/key-parquet-projection-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0);
