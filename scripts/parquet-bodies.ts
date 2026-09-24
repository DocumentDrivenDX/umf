import {captureParquet,decodeParquetPageBodies} from '../src';
const base='fixtures/parquet/bodies/',m=await Bun.file('fixtures/parquet/pages/results.json').json(),results=[];
for(const c of m.results){const r=decodeParquetPageBodies(captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id}));if(r.pages)await Bun.write(base+c.id+'.json',JSON.stringify(r.pages,null,2)+'\n');results.push({id:c.id,path:c.path,status:r.status,decodedBytes:r.decodedBytes,pages:r.pages?.length,checksums:r.pages?.filter(p=>p.checksum==='verified').length,diagnostics:r.diagnostics.filter(d=>d.severity==='error')});}
await Bun.write(base+'results.json',JSON.stringify({files:results.length,decoded:results.filter(r=>r.status==='decoded').length,results},null,2)+'\n');console.log({files:results.length,decoded:results.filter(r=>r.status==='decoded').length,blocked:results.filter(r=>r.status==='blocked').map(r=>r.id)});
export {};
