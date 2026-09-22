import {createHash} from 'node:crypto';
import {projectCardinalityToParquet,exportParquetCapture} from '../../src';
import {parquetCardinalityProjectionCases} from './cardinality-parquet-projection-cases';
import {verifyParquetCardinalityComposition} from './cardinality-parquet-composition';
const rows=[],cases=[];let recoveries=0,nativeRecoveries=0;
for(const c of parquetCardinalityProjectionCases()){
 const result=projectCardinalityToParquet(c.author,c.request);cases.push({id:c.id,author:c.author,request:c.request,result});
 if(!result.target)continue;
 const bytes=exportParquetCapture(result.target),path='fixtures/parquet/cardinality-projections/'+c.id+'.parquet';
 const composition=verifyParquetCardinalityComposition(result);recoveries+=composition.idealRecoveries;nativeRecoveries+=composition.nativeRecoveries;
 await Bun.write(path,bytes);rows.push({id:c.id,carrier:c.request.nativeType,path,composition,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const corpus='fixtures/validation/cardinality-parquet-projection-corpus.json';
await Bun.write(corpus,JSON.stringify({scope:'Authored Cardinality projection and fresh-native classification; both retained recovery directions',cases,rows,recoveries,nativeRecoveries},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/cardinality-parquet-projection-native.py'],{stdout:'inherit',stderr:'inherit'});
if(await child.exited!==0)throw Error('Native projection validation failed');
console.log(JSON.stringify({cases:cases.length,projected:rows.length,blocked:cases.length-rows.length,idealRecoveries:recoveries,nativeRecoveries}));
