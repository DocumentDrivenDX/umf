import {test,expect} from 'bun:test';
import {captureArrowIpc,inspectArrowIpcConsistency,inspectArrowIpcLayout,encodeArrowFlatbuffer,proposeArrowFlatbufferEdit,coreSchema,arrowIpcLayoutSchema,arrowIpcConsistencySchema} from '../../src';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';
import {createValidator} from '../../src/validation/schema';
const validator=createValidator();validator.addSchema(coreSchema);validator.addSchema(arrowIpcLayoutSchema);const check=validator.compile(arrowIpcConsistencySchema);
const base='fixtures/arrow/ipc-inputs/';const cases=(await Bun.file(base+'layout-oracle-results.json').json()).cases;
async function changedFooter(path:string,value:any){const raw=new Uint8Array(await Bun.file(base+'int64.file.arrow').arrayBuffer());const layout=inspectArrowIpcLayout(captureArrowIpc(raw,{id:'edit'}));const footer=encodeArrowFlatbuffer(proposeArrowFlatbufferEdit(layout.footer!.metadata,path,value).document,flatbufferBackend);const output=new Uint8Array(layout.footer!.offset+footer.length+10);output.set(raw.subarray(0,layout.footer!.offset));output.set(footer,layout.footer!.offset);new DataView(output.buffer).setInt32(output.length-10,footer.length,true);output.set(new TextEncoder().encode('ARROW1'),output.length-6);return output;}
test('US-016-AC10: all native corpus footers agree with their streams',async()=>{
 let matched=0;for(const c of cases){const bytes=new Uint8Array(await Bun.file(base+c.file).arrayBuffer());const report=inspectArrowIpcConsistency(captureArrowIpc(bytes,{id:c.file}));expect(check(report)).toBe(true);expect(report.complete).toBe(false);expect(report.footerChecks).toBe(c.format==='file'?'matched':'not-applicable');expect(report.diagnostics).toEqual([]);if(c.format==='file')matched++;}expect(matched).toBe(9);
},20000);
test('US-016-AC10: validly framed native footer edits expose schema, version and block contradictions',async()=>{
 for(const [path,value,code] of [['/value/schema/fields/0/name','changed','ARROW_IPC_FOOTER_SCHEMA'],['/value/version','V4','ARROW_IPC_FOOTER_VERSION'],['/value/recordBatches/0/offset','8','ARROW_IPC_FOOTER_BLOCK_OFFSET'],['/value/recordBatches/0/metaDataLength',8,'ARROW_IPC_FOOTER_BLOCK_LENGTH'],['/value/recordBatches/1/offset','264','ARROW_IPC_FOOTER_BLOCK_DUPLICATE'],['/value/recordBatches',[],'ARROW_IPC_FOOTER_BLOCK_COUNT']] as const){const bytes=await changedFooter(path,value);const report=inspectArrowIpcConsistency(captureArrowIpc(bytes,{id:'mismatch'}));expect(report.layout.bytesAccountedFor).toBe(true);expect(report.footerChecks).toBe('mismatch');expect(report.diagnostics.some(d=>d.code===code)).toBe(true);}
});

test('US-016-AC10: reordered blocks are an explicit recommendation mismatch, not a validity error',async()=>{
 const raw=new Uint8Array(await Bun.file(base+'int64.file.arrow').arrayBuffer());const layout=inspectArrowIpcLayout(captureArrowIpc(raw,{id:'order'}));const p=layout.footer!.metadata.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as any;
 const report=inspectArrowIpcConsistency(captureArrowIpc(await changedFooter('/value/recordBatches',[...p.model.value.recordBatches].reverse()),{id:'order'}));expect(report.footerChecks).toBe('mismatch');expect(report.diagnostics.every(d=>d.code==='ARROW_IPC_FOOTER_BLOCK_ORDER'&&d.severity==='warning')).toBe(true);
});
