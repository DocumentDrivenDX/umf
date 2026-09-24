import {captureParquet,inspectParquetLogicalTypes} from '../src';
const base='fixtures/parquet/logical/',positive=await Bun.file('fixtures/parquet/capture-results.json').json(),authored=await Bun.file(base+'manifest.json').json(),results=[];
for(const c of [...positive.results.map((r:any)=>({...r,expected:'checked'})),...authored.cases]){const r=inspectParquetLogicalTypes(captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id}));if(r.status!==c.expected)throw Error(c.id+': '+JSON.stringify(r.diagnostics));results.push({id:c.id,path:c.path,status:r.status,annotations:r.annotations,diagnostics:r.diagnostics.filter(d=>d.code.startsWith('PARQUET_LOGICAL')||d.code.startsWith('PARQUET_LEGACY')||d.code==='PARQUET_DECIMAL_SMALL_INT64')});}
const output={files:results.length,checked:results.filter(r=>r.status==='checked').length,blocked:results.filter(r=>r.status==='blocked').length,results};await Bun.write(base+'results.json',JSON.stringify(output,null,2)+'\n');console.log({...output,results:undefined});

if(output.files!==69||output.checked!==54||output.blocked!==15)throw Error('Logical baseline changed');
