import {captureArrowIpc,renameArrowIpcField,exportArrowIpcCapture} from '../src';
import {flatbufferBackend} from '../native/arrow/flatbuffer-runtime';
const base='fixtures/arrow/ipc-inputs/',cases=(await Bun.file(base+'layout-oracle-results.json').json()).cases;
for(const c of cases){const raw=new Uint8Array(await Bun.file(base+c.file).arrayBuffer());const result=renameArrowIpcField(captureArrowIpc(raw,{id:c.file}),{fieldPath:[0],name:'renamed_field_with_a_longer_name',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend);await Bun.write(base+c.file+'.renamed.arrow',exportArrowIpcCapture(result.document));}
console.log({renamed:cases.length});
