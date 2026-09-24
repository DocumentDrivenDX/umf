import {test,expect} from 'bun:test';
import {captureArrowIpc,inspectArrowIpcLayout,exportArrowIpcCapture,coreSchema,arrowIpcLayoutSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const validator=createValidator();validator.addSchema(coreSchema);const check=validator.compile(arrowIpcLayoutSchema);
const base='fixtures/arrow/ipc-inputs/';const oracle=await Bun.file(base+'layout-oracle-results.json').json();
test('US-016-AC9: IPC file/stream boundaries agree with native PyArrow for all corpus inputs',async()=>{
 expect(oracle.cases.length).toBe(19);
 for(const c of oracle.cases){const bytes=new Uint8Array(await Bun.file(base+c.file).arrayBuffer());const report=inspectArrowIpcLayout(captureArrowIpc(bytes,{id:c.file}));
  expect(check(report)).toBe(true);expect(report.format).toBe(c.format);expect(report.bytesAccountedFor).toBe(true);expect(report.complete).toBe(false);expect(report.consumed).toBe(bytes.length);expect(report.trailingBytes).toBe(0);expect(report.diagnostics.some(d=>d.severity==='error')).toBe(false);
  expect(report.frames.map(({metadata,...frame})=>frame)).toEqual(c.frames);expect(report.eosOffset).toBe(c.eosOffset);if(c.footer)expect({offset:report.footer!.offset,length:report.footer!.length}).toEqual(c.footer);expect(exportArrowIpcCapture(report.source)).toEqual(bytes);
 }
},20000);
test('US-016-AC9: optional EOS, trailing content, concatenated streams and truncation are distinct',async()=>{
 const bytes=new Uint8Array(await Bun.file(base+'int64.stream.arrow').arrayBuffer());const joined=new Uint8Array(bytes.length*2);joined.set(bytes);joined.set(bytes,bytes.length);const trailing=new Uint8Array(bytes.length+3);trailing.set(bytes);trailing.set([1,2,3],bytes.length);
 const noEos=inspectArrowIpcLayout(captureArrowIpc(bytes.slice(0,-8),{id:'eof'}));expect(noEos.bytesAccountedFor).toBe(true);expect(noEos.eosOffset).toBeUndefined();
 for(const input of [joined,trailing]){const result=inspectArrowIpcLayout(captureArrowIpc(input,{id:'trailing'}));expect(result.bytesAccountedFor).toBe(false);expect(result.consumed).toBe(bytes.length);expect(result.trailingBytes).toBe(input.length-bytes.length);expect(result.diagnostics.some(d=>d.code==='ARROW_IPC_TRAILING')).toBe(true);expect(exportArrowIpcCapture(result.source)).toEqual(input);}
 for(const input of [new Uint8Array(),bytes.slice(0,4),bytes.slice(0,20),bytes.slice(0,-20)]){const result=inspectArrowIpcLayout(captureArrowIpc(input,{id:'bad'}));expect(result.bytesAccountedFor).toBe(false);expect(result.diagnostics.some(d=>d.code==='ARROW_IPC_FRAMING')).toBe(true);expect(exportArrowIpcCapture(result.source)).toEqual(input);}
});
test('US-016-AC9: corrupt file footer offsets and magic cannot count as complete framing',async()=>{
 const original=new Uint8Array(await Bun.file(base+'int64.file.arrow').arrayBuffer());
 for(const where of ['length','magic']){const bytes=original.slice();if(where==='length')new DataView(bytes.buffer).setInt32(bytes.length-10,bytes.length,true);else bytes[bytes.length-1]=0;const result=inspectArrowIpcLayout(captureArrowIpc(bytes,{id:where}));expect(result.bytesAccountedFor).toBe(false);expect(result.diagnostics.some(d=>d.severity==='error')).toBe(true);}
});
