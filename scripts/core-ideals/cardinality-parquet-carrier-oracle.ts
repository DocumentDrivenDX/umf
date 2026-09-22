import {createHash} from 'node:crypto';
import {parquetCardinalityFile} from '../../src/core-ideals/parquet-cardinality-carrier';
import {parquetCardinalityCarrierCases} from './cardinality-parquet-carrier-cases';
const rows=[];
for(const c of parquetCardinalityCarrierCases()){
 const bytes=parquetCardinalityFile('NativeRecord','value',c.carrier),path='fixtures/parquet/cardinality-carriers/'+c.id+'.parquet';
 await Bun.write(path,bytes);rows.push({...c,path,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await Bun.write('fixtures/validation/cardinality-parquet-carrier-corpus.json',JSON.stringify({scope:'Explicit native carrier schemas, not authored ideal projection',rows},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/cardinality-parquet-carrier-native.py'],{stdout:'inherit',stderr:'inherit'});
if(await child.exited!==0)throw Error('Native carrier oracle failed');
