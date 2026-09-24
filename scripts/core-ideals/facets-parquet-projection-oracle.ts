import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parquetFacetProjectionCases} from './facets-parquet-projection-cases';
import {projectFacetsToParquet,recoverFacetsFromParquet} from '../../src/core-ideals/facets-parquet-projection';
import {exportParquetCapture,readJsonValue,writeJsonValue,copyJson} from '../../src';
let blocked=0,recoveries=0;const rows=[];
for(const c of parquetFacetProjectionCases()){
 const result=projectFacetsToParquet(c.author,c.request);
 if(result.status==='blocked'){assert.equal(result.target,undefined);blocked++;continue;}
 const bytes=exportParquetCapture(result.target!),path=`fixtures/parquet/facets/projection-${c.id}.parquet`;await Bun.write(path,bytes);
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;assert.deepEqual(recoverFacetsFromParquet(receipt,bytes),c.author.target);recoveries++;}
 const carrier=c.request.carrier;
 rows.push({id:c.id,path,request:c.request,outcome:result.mapping.outcome,residuals:result.residuals.map(r=>({path:r.path,reason:r.reason,outcome:r.outcome})),sha256:createHash('sha256').update(bytes).digest('hex'),expectNative:!(carrier.kind==='decimal'&&carrier.precision>76)});
}
const counts={cases:parquetFacetProjectionCases().length,projected:rows.length,blocked,idealRecoveries:recoveries};
await Bun.write('fixtures/validation/facets-parquet-projection-corpus.json',JSON.stringify({scope:'Authored facet projections with retained ideal recovery; not full binding acceptance',counts,rows},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/facets-parquet-projection-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0);console.log(JSON.stringify(counts));
