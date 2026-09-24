import {captureParquet,exportParquetCapture,inspectParquetContainers,renameParquetField,readDocument,writeDocument} from '../src';
const base='fixtures/parquet/rename/',m=await Bun.file(base+'manifest.json').json(),results=[];
for(const c of m.cases){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),source=captureParquet(bytes,{id:c.id}),before=inspectParquetContainers(source),schema=(before.metadata as any).schema;
 for(let index=1;index<(c.expected==='blocked'?2:schema.length);index++){
  const name='renamed.注文_'+index,r=renameParquetField(source,index,name),id=c.id+'-'+index;if(r.status!==(c.expected??'transformed'))throw Error(id+': '+JSON.stringify(r.diagnostics));
  let sha256,roundtripSha256;if(r.output){const output=exportParquetCapture(r.output);for(const format of ['json','yaml'] as const)if(!Buffer.from(exportParquetCapture(readDocument(writeDocument(r.output,format),format))).equals(Buffer.from(output)))throw Error('Edited round trip changed');await Bun.write(base+'exports/'+id+'.parquet',output);sha256=new Bun.CryptoHasher('sha256').update(output).digest('hex');const back=renameParquetField(r.output,index,schema[index].name);if(!back.output)throw Error('Inverse rename blocked');const restored=exportParquetCapture(back.output);await Bun.write(base+'restored/'+id+'.parquet',restored);roundtripSha256=new Bun.CryptoHasher('sha256').update(restored).digest('hex');}
  results.push({id,path:c.path,index,name,status:r.status,rename:r.rename,unchangedPrefixBytes:r.unchangedPrefixBytes,sha256,roundtripSha256});
 }
}
await Bun.write(base+'results.json',JSON.stringify({cases:results.length,transformed:results.filter(c=>c.status==='transformed').length,results},null,2)+'\n');console.log({cases:results.length,transformed:results.filter(c=>c.status==='transformed').length});
export {};
