import {createHash} from 'node:crypto';
import {captureParquet,decodeParquetLevels} from '../src';
const root='fixtures/parquet/levels/';
const upstream=await Bun.file(root+'results.json').json();
const authored=await Bun.file(root+'authored/manifest.json').json();
const cases=[...upstream.results,...authored.cases];
const frozen=[];
for(const c of cases){
 const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer());
 const r=decodeParquetLevels(captureParquet(bytes,{id:c.id}));
 frozen.push({id:c.id,path:c.path,inputSha256:createHash('sha256').update(bytes).digest('hex'),status:r.status,complete:r.complete,diagnostics:r.diagnostics,pagesFile:r.pages?`${c.id}.json`:null});
}
await Bun.write(root+'rust-levels-ts-freeze.json',JSON.stringify({runtime:`Bun ${Bun.version}`,operationSourceSha256:createHash('sha256').update(new Uint8Array(await Bun.file('src/adapters/parquet/levels.ts').arrayBuffer())).digest('hex'),hybridSourceSha256:createHash('sha256').update(new Uint8Array(await Bun.file('src/adapters/parquet/hybrid.ts').arrayBuffer())).digest('hex'),cases:frozen},null,2)+'\n');
console.log(`${cases.length} outcomes; ${frozen.filter(c=>c.status==='decoded').length} decoded; ${frozen.filter(c=>c.status==='blocked').length} blocked`);
