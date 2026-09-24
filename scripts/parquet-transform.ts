import {captureParquet,decodeParquetFooter,encodeParquetWire,appendParquetKeyValueMetadata,exportParquetCapture,readDocument,writeDocument} from '../src';
const base='fixtures/parquet/transforms/',manifest=await Bun.file('fixtures/parquet/footer/manifest.json').json(),results=[];
const additions=[{key:'umf.example.description',value:'Orders / 注文 / 🧾'},{key:'umf.example.unset'},{key:'umf.example.empty',value:''},{key:'umf.example.bom',value:'\ufeffvalue'}];
for(const c of manifest.results){
 const input=new Uint8Array(await Bun.file(c.path).arrayBuffer()),source=captureParquet(input,{id:c.id}),decoded=decodeParquetFooter(source);if(!decoded.value)throw Error('Decode failed');const footer=encodeParquetWire(decoded.value);await Bun.write(base+'wire/'+c.id+'.compact',footer);
 if(c.id==='native-boundaries'){results.push({...c,wireOnly:true});continue;}
 const r=appendParquetKeyValueMetadata(source,additions);if(r.status!=='transformed')throw Error(c.id+': '+JSON.stringify(r.diagnostics));const bytes=exportParquetCapture(r.output!);
 for(const format of ['json','yaml'] as const){const roundtrip=exportParquetCapture(readDocument(writeDocument(r.output!,format),format));if(!Buffer.from(roundtrip).equals(Buffer.from(bytes)))throw Error('Edited capture changed through UMF');}
 if(!Buffer.from(bytes.subarray(0,r.unchangedPrefixBytes)).equals(Buffer.from(input.subarray(0,r.unchangedPrefixBytes))))throw Error('Data prefix changed');
 await Bun.write(base+'exports/'+c.id+'.parquet',bytes);results.push({...c,wireOnly:false,unchangedPrefixBytes:r.unchangedPrefixBytes,outputSha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex')});
}
await Bun.write(base+'results.json',JSON.stringify({wireFiles:results.length,transformed:results.filter(r=>!r.wireOnly).length,additions,results},null,2)+'\n');console.log({wireFiles:results.length,transformed:results.filter(r=>!r.wireOnly).length});
export {};
