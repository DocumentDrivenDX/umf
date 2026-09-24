import {readParquetValuesTrial} from './experiments/parquet-values';
const base='fixtures/parquet/values-trial/',m=await Bun.file(base+'manifest.json').json(),results=[];
for(const c of m.cases){const actual=await readParquetValuesTrial(await Bun.file(c.path).arrayBuffer()),expected=await Bun.file(base+c.id+'.expected.json').json();await Bun.write(base+c.id+'.actual.json',JSON.stringify(actual,null,2)+'\n');if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Native values differ: '+c.id);results.push({...c,matched:true});}
await Bun.write(base+'results.json',JSON.stringify({files:results.length,results},null,2)+'\n');console.log({files:results.length});
export {};
