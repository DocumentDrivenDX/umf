import {captureParquet,decodeParquetPhysical} from '../src';
const base='fixtures/parquet/physical/',m=await Bun.file('fixtures/parquet/levels/results.json').json(),results=[];
for(const c of m.results){const r=decodeParquetPhysical(captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id}));if(r.pages)await Bun.write(base+c.id+'.json',JSON.stringify(r.pages,null,2)+'\n');results.push({id:c.id,path:c.path,status:r.status,pages:r.pages?.length,materializedBytes:r.materializedBytes,diagnostics:r.diagnostics.filter(d=>d.severity==='error')});}
await Bun.write(base+'results.json',JSON.stringify({files:results.length,decoded:results.filter(r=>r.status==='decoded').length,results},null,2)+'\n');console.log({decoded:results.filter(r=>r.status==='decoded').length,blocked:results.filter(r=>r.status==='blocked').map(r=>({id:r.id,diagnostics:r.diagnostics}))});
export {};
