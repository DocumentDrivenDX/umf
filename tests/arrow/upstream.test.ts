import {test,expect} from 'bun:test';
import {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcConsistency,renameArrowIpcField} from '../../src';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';
const paths=['generated_decimal.arrow_file','generated_primitive_no_batches.arrow_file','generated_primitive_zerolength.arrow_file'];
test('US-016-AC12: readable historical metadata-version discrepancies are preserved and block unqualified rewrite',async()=>{
 for(const path of paths){const bytes=new Uint8Array(await Bun.file('fixtures/arrow/upstream/0.14.1/'+path).arrayBuffer()),doc=captureArrowIpc(bytes,{id:path});const result=inspectArrowIpcConsistency(doc);
  expect(result.layout.bytesAccountedFor).toBe(true);expect(result.footerChecks).toBe('mismatch');expect(result.diagnostics.map(d=>d.code)).toEqual(['ARROW_IPC_FOOTER_VERSION']);expect(exportArrowIpcCapture(result.layout.source)).toEqual(bytes);
  expect(()=>renameArrowIpcField(doc,{fieldPath:[0],name:'changed',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend)).toThrow('matching footer');
 }
});
