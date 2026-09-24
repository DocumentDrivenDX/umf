import {captureParquet,decodeParquetValues} from '../src';
const base='fixtures/parquet/values/',m=await Bun.file('fixtures/parquet/rows/results.json').json(),results=[];
for(const c of m.results){const r=decodeParquetValues(captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id}));if(r.rows)await Bun.write(base+c.id+'.json',JSON.stringify(r.rows,null,2)+'\n');results.push({id:c.id,path:c.path,status:r.status,rows:r.rows?.length,diagnostics:r.diagnostics.filter(d=>d.severity==='error')});}
await Bun.write(base+'results.json',JSON.stringify({files:results.length,projected:results.filter(r=>r.status==='projected').length,results},null,2)+'\n');console.log({projected:results.filter(r=>r.status==='projected').length,blocked:results.filter(r=>r.status==='blocked').map(r=>({id:r.id,diagnostics:r.diagnostics}))});
export {};
