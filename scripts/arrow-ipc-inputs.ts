import {createHash} from 'node:crypto';
import {probeIpc} from '../native/arrow/ipc-probe';
const base='fixtures/arrow/ipc-inputs/';const manifest=await Bun.file(base+'manifest.json').json();const results=[];
for(const c of manifest.cases){
 const bytes=new Uint8Array(await Bun.file(base+c.file).arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==c.sha256)throw Error('Fixture hash '+c.file);
 try{const result=probeIpc(bytes);if(result.rows!==c.rows||result.batches!==c.batches||result.format!==c.format)throw Error('Batch shape mismatch');
  await Bun.write(base+c.file+'.js.arrow',result.output);results.push({...c,status:'rewritten',descriptor:result.descriptor});
 }catch(e){results.push({...c,status:'rejected',message:(e as Error).message});}
}
for(const result of results){
 const unsupported=['listview','largelistview','runendencoded'].includes(result.name);
 if(result.status!==(unsupported?'rejected':'rewritten'))throw Error('Unexpected native IPC outcome '+result.file);
 if(unsupported&&!result.message?.startsWith('Unrecognized type:'))throw Error('Unexpected rejection '+result.file);
}
if(results.length!==18)throw Error('Unexpected IPC corpus size');
await Bun.write(base+'native-results.json',JSON.stringify(results,null,2)+'\n');
console.log(results.map(r=>({file:r.file,status:r.status,...(r.message?{message:r.message}:{})})));
