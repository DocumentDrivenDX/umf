import {captureParquet,assembleParquetRows} from '../src';
const base='fixtures/parquet/rows/',m=await Bun.file('fixtures/parquet/physical/results.json').json(),results=[];
for(const c of m.results){const r=assembleParquetRows(captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id}));if(r.rows)await Bun.write(base+c.id+'.json',JSON.stringify(r.rows,null,2)+'\n');results.push({id:c.id,path:c.path,status:r.status,rows:r.rows?.length,diagnostics:r.diagnostics.filter(d=>d.severity==='error')});}
await Bun.write(base+'results.json',JSON.stringify({files:results.length,assembled:results.filter(r=>r.status==='assembled').length,results},null,2)+'\n');console.log({assembled:results.filter(r=>r.status==='assembled').length,blocked:results.filter(r=>r.status==='blocked').map(r=>({id:r.id,diagnostics:r.diagnostics}))});
export {};
