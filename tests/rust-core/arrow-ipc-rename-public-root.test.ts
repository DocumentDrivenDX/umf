import {expect,test} from 'bun:test';
import {captureArrowIpc,exportArrowIpcCapture,renameArrowIpcField} from '../../src/index-node-v4';

test('Node V4 Arrow IPC rename is Rust-owned, source-retaining, and checks unchanged data frames',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/arrow/ipc-inputs/int64.file.arrow').arrayBuffer());
 const source=captureArrowIpc(bytes,{id:'arrow-ipc-rename'});
 const result=renameArrowIpcField(source,{fieldPath:[0],name:'renamed_field',uninterpretedMetadata:'preserve-and-report'});
 expect(result.document).not.toEqual(source);expect(result.source).toEqual(source);expect(exportArrowIpcCapture(result.source)).toEqual(bytes);
 expect(result.bodyBytesPreserved).toBe(true);expect(result.validation.layout.bytesAccountedFor).toBe(true);
 const first:any=result.validation.layout.frames[0]!.metadata;
 expect(first.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer']!.model.value.header.value.fields[0]!.name).toBe('renamed_field');
 expect(result.diagnostics.some(item=>item.code==='ARROW_IPC_NAME_REFERENCES_UNVERIFIED')).toBe(true);
 expect(()=>renameArrowIpcField(source,{fieldPath:[99],name:'bad',uninterpretedMetadata:'preserve-and-report'})).toThrow();
});
