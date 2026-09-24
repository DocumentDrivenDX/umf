import {captureParquet,getParquetArrowSchema,proposeArrowFlatbufferEdit,encodeArrowFlatbuffer} from '../src';
import {flatbufferBackend} from '../native/arrow/flatbuffer-runtime';
const base='fixtures/parquet/arrow-nested/',source=captureParquet(new Uint8Array(await Bun.file(base+'nested.parquet').arrayBuffer()),{id:'map-label-probe'}),observed=getParquetArrowSchema(source),cases=[];
for(const [index,role] of ['key','value'].entries()){
 const proposedName='renamed_'+role,document=proposeArrowFlatbufferEdit(observed.message!,'/value/header/value/fields/1/children/0/children/'+index+'/name',proposedName).document,metadata=encodeArrowFlatbuffer(document,flatbufferBackend),bytes=new Uint8Array(8+Math.ceil(metadata.length/8)*8),view=new DataView(bytes.buffer);view.setInt32(0,-1,true);view.setInt32(4,bytes.length-8,true);bytes.set(metadata,8);
 const path=base+'map-'+role+'-label.arrow';await Bun.write(path,bytes);cases.push({role,proposedName,path,sha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex')});
}
await Bun.write(base+'map-label-probes.json',JSON.stringify({cases},null,2)+'\n');
