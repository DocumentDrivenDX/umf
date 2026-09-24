import {readDocument,encodeArrowFlatbuffer} from '../src';
import {flatbufferBackend} from '../native/arrow/flatbuffer-runtime';
const base='fixtures/projections/spark-arrow/',report=await Bun.file(base+'native-results.json').json();let encoded=0;
for(const row of report.results){if(row.status!=='converted')continue;const doc=readDocument(await Bun.file(base+row.id+'.projected.json').text(),'json'),metadata=encodeArrowFlatbuffer(doc,flatbufferBackend),padded=Math.ceil(metadata.length/8)*8,bytes=new Uint8Array(8+padded),view=new DataView(bytes.buffer);view.setInt32(0,-1,true);view.setInt32(4,padded,true);bytes.set(metadata,8);await Bun.write(base+row.id+'.projected.arrow',bytes);encoded++;}console.log({encoded});
