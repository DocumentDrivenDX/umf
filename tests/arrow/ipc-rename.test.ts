import {test,expect} from 'bun:test';
import {captureArrowIpc,exportArrowIpcCapture,renameArrowIpcField,inspectArrowIpcLayout,coreSchema,arrowIpcLayoutSchema,arrowIpcConsistencySchema,arrowIpcRenameSchema} from '../../src';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';
import {createValidator} from '../../src/validation/schema';
const validator=createValidator();for(const schema of [coreSchema,arrowIpcLayoutSchema,arrowIpcConsistencySchema])validator.addSchema(schema);const check=validator.compile(arrowIpcRenameSchema);
const base='fixtures/arrow/ipc-inputs/';
test('US-016-AC11: complete dataset rename preserves source and records while moving footer offsets',async()=>{
 for(const file of ['int64.file.arrow','dictionary.stream.arrow','listview.file.arrow','int64.legacy.arrow']){
  const bytes=new Uint8Array(await Bun.file(base+file).arrayBuffer()),doc=captureArrowIpc(bytes,{id:file});doc.vocabularies.future={version:'0.1.0'};doc.extensions={future:{retain:true}};
  const result=renameArrowIpcField(doc,{fieldPath:[0],name:'a_much_longer_field_name',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend);
  expect(check(result)).toBe(true);expect(result.complete).toBe(false);expect(result.bodyBytesPreserved).toBe(true);expect(exportArrowIpcCapture(result.source)).toEqual(bytes);expect(exportArrowIpcCapture(doc)).toEqual(bytes);expect(result.document.extensions).toEqual(doc.extensions);expect(result.validation.layout.bytesAccountedFor).toBe(true);expect(result.diagnostics.some(d=>d.code==='ARROW_IPC_NAME_REFERENCES_UNVERIFIED')).toBe(true);
  const p=result.validation.layout.frames[0]!.metadata.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as any;expect(p.model.value.header.value.fields[0].name).toBe('a_much_longer_field_name');
 }
},20000);
test('US-016-AC11: nested names, missing EOS and invalid paths have explicit outcomes',async()=>{
 const original=new Uint8Array(await Bun.file(base+'struct.stream.arrow').arrayBuffer());const doc=captureArrowIpc(original.slice(0,-8),{id:'nested'});
 const result=renameArrowIpcField(doc,{fieldPath:[0,0],name:'nested_name',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend);expect(result.validation.layout.eosOffset).toBeUndefined();
 const p=result.validation.layout.frames[0]!.metadata.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as any;expect(p.model.value.header.value.fields[0].children[0].name).toBe('nested_name');
 for(const fieldPath of [[],[5],[0,5],[-1],[0.5]])expect(()=>renameArrowIpcField(doc,{fieldPath,name:'bad',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend)).toThrow();
 const trailing=new Uint8Array(original.length+1);trailing.set(original);expect(()=>renameArrowIpcField(captureArrowIpc(trailing,{id:'trailing'}),{fieldPath:[0],name:'bad',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend)).toThrow('framing');
 expect(inspectArrowIpcLayout(doc).bytesAccountedFor).toBe(true);
});
