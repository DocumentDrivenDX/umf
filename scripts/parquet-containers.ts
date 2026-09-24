import {captureParquet,inspectParquetContainers} from '../src';
const base='fixtures/parquet/containers/',authored=await Bun.file(base+'manifest.json').json(),positive=await Bun.file('fixtures/parquet/capture-results.json').json(),results=[];
for(const c of [...positive.results.map((r:any)=>({...r,expected:'checked'})),...authored.cases]){const r=inspectParquetContainers(captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id}));if(r.status!==c.expected)throw Error(c.id+': '+JSON.stringify(r.diagnostics));results.push({id:c.id,path:c.path,status:r.status,containers:r.containers,diagnostics:r.diagnostics});}
await Bun.write(base+'results.json',JSON.stringify({files:results.length,results},null,2)+'\n');console.log({files:results.length,checked:results.filter(r=>r.status==='checked').length});
export {};
