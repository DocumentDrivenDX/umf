import {expect,test} from 'bun:test';
import {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcConsistency,inspectArrowIpcLayout} from '../../src/index-node-v4';

test('Node V4 Arrow IPC layout and footer consistency are Rust-owned and source-retaining',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/arrow/ipc-inputs/int64.file.arrow').arrayBuffer());
 const source=captureArrowIpc(bytes,{id:'arrow-ipc-inspection'});
 const layout=inspectArrowIpcLayout(source);
 expect(layout.format).toBe('file');expect(layout.bytesAccountedFor).toBe(true);expect(layout.frames.map(frame=>frame.kind)).toEqual(['Schema','RecordBatch','RecordBatch']);
 expect(exportArrowIpcCapture(layout.source)).toEqual(bytes);
 const consistency=inspectArrowIpcConsistency(source);
 expect(consistency.complete).toBe(false);expect(consistency.footerChecks).toBe('matched');expect(consistency.layout.source).toEqual(source);
 const invalid=captureArrowIpc(bytes.slice(0,20),{id:'arrow-ipc-invalid'});
 const refused=inspectArrowIpcConsistency(invalid);
 expect(refused.footerChecks).toBe('unverified');expect(refused.diagnostics.some(item=>item.code==='ARROW_IPC_FOOTER_UNVERIFIED')).toBe(true);
 expect(exportArrowIpcCapture(refused.layout.source)).toEqual(bytes.slice(0,20));
});
