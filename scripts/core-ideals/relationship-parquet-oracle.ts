import {relationshipParquetCases} from './relationship-parquet-cases';
import {projectRelationshipToParquet} from '../../src/core-ideals/relationship-parquet-projection';
import {exportParquetCapture} from '../../src/adapters/parquet';
import {createHash} from 'node:crypto';
const cases=[];
for(const c of relationshipParquetCases()){
 const r=projectRelationshipToParquet(c.source,c.author,c.request);if(r.status!==c.expected)throw Error(c.name);
 if(!r.target)continue;const path='fixtures/parquet/relationships/'+c.name+'.parquet',bytes=exportParquetCapture(r.target);await Bun.write(path,bytes);cases.push({name:c.name,path,request:c.request,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await Bun.write('fixtures/validation/relationship-parquet-corpus.json',JSON.stringify({cases},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/relationship-parquet-native.py'],{stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Native oracle failed');
