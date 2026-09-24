import {decodeArrowFlatbuffer,exportArrowFlatbufferModel,exportArrowIpcCapture,type ArrowFlatbufferRoot} from '../src';
import {createHash} from 'node:crypto';
const base='fixtures/arrow/metadata/';const manifest=await Bun.file(base+'manifest.json').json();let checked=0;
for(const c of manifest.cases){
 const bytes=new Uint8Array(await Bun.file(base+c.file).arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==c.sha256)throw Error('Fixture hash mismatch');
 const result=decodeArrowFlatbuffer(bytes,{id:c.file,rootType:c.rootType as ArrowFlatbufferRoot});
 if(!result.model||result.status!=='decoded'||result.diagnostics.some(d=>d.code!=='ARROW_FLATBUFFER_INCOMPLETE'))throw Error(c.file+': '+JSON.stringify(result.diagnostics));
 if(createHash('sha256').update(exportArrowIpcCapture(result.source)).digest('hex')!==c.sha256)throw Error('Source changed');
 await Bun.write(base+c.file+'.umf.json',exportArrowFlatbufferModel(result.model));checked++;
}
console.log({decodedMetadataRoots:checked});
