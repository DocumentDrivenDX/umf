import {inspectArrowIpcConsistency,type ArrowIpcConsistency} from './ipc-consistency';
import {exportArrowIpcCapture,captureArrowIpc,ARROW_IPC_MAX_BYTES,ARROW_IPC_EXTENSION} from './capture';
import {exportArrowFlatbufferModel,importArrowFlatbufferModel} from './flatbuffer-model';
import {encodeArrowFlatbuffer,type ArrowFlatbufferEncodingBackend} from './flatbuffer-encode';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
export interface ArrowIpcRenameResult {source:Document;document:Document;complete:false;bodyBytesPreserved:true;validation:ArrowIpcConsistency;diagnostics:Diagnostic[];}
/** Renames a positional field without changing physical types or record/dictionary messages. */
export function renameArrowIpcField(document:Document,options:{fieldPath:number[];name:string;uninterpretedMetadata:'preserve-and-report'},backend:ArrowFlatbufferEncodingBackend):ArrowIpcRenameResult{
 if(options.uninterpretedMetadata!=='preserve-and-report')throw new UmfError('ARROW_IPC_RENAME_POLICY','Explicit preserve-and-report metadata policy is required');
 if(typeof options.name!=='string'||!Array.isArray(options.fieldPath)||!options.fieldPath.length||options.fieldPath.length>128||options.fieldPath.some(i=>!Number.isSafeInteger(i)||i<0))throw new UmfError('ARROW_IPC_RENAME_PATH','Expected bounded positional field path and string name');
 const checked=inspectArrowIpcConsistency(document),layout=checked.layout,original=exportArrowIpcCapture(document);
 if(!layout.bytesAccountedFor||layout.diagnostics.some(d=>d.severity==='error'||d.code==='ARROW_FLATBUFFER_UNKNOWN_SLOT')||!['matched','not-applicable'].includes(checked.footerChecks))throw new UmfError('ARROW_IPC_RENAME_SOURCE','Complete known framing and matching footer declarations are required');
 if(layout.frames.slice(1).some(f=>!['RecordBatch','DictionaryBatch'].includes(f.kind))||layout.frames[0]!.bodyLength!==0)throw new UmfError('ARROW_IPC_RENAME_SOURCE','Expected one body-free schema followed by record/dictionary batches');
 function rename(schema:any){let fields=schema.fields,field:any;for(const index of options.fieldPath){if(!Array.isArray(fields)||index>=fields.length)throw new UmfError('ARROW_IPC_RENAME_PATH','Field path does not exist');field=fields[index];fields=field.children;}field.name=options.name;}
 const first=layout.frames[0]!,message=JSON.parse(exportArrowFlatbufferModel(first.metadata));rename(message.value.header.value);
 const metadata=encodeArrowFlatbuffer(importArrowFlatbufferModel(JSON.stringify(message),{id:document.id+'/renamed-schema'}),backend);
 const padded=Math.ceil((first.prefixLength+metadata.length)/8)*8-first.prefixLength;
 const schemaFrame=new Uint8Array(first.prefixLength+padded),prefix=new DataView(schemaFrame.buffer);if(first.prefixLength===8)prefix.setInt32(0,-1,true);prefix.setInt32(first.prefixLength-4,padded,true);schemaFrame.set(metadata,first.prefixLength);
 const chunks:Uint8Array[]=[];let size=0;const offsets=new Map<number,number>();
 function append(bytes:Uint8Array){if(size+bytes.length>ARROW_IPC_MAX_BYTES)throw new UmfError('ARROW_IPC_LIMIT','Renamed IPC exceeds capture limit');chunks.push(bytes);size+=bytes.length;}
 if(layout.format==='file')append(original.slice(0,8));
 for(let i=0;i<layout.frames.length;i++){const frame=layout.frames[i]!;offsets.set(frame.offset,size);append(i===0?schemaFrame:original.slice(frame.offset,frame.bodyOffset+frame.bodyLength));}
 if(layout.eosOffset!==undefined)append(original.slice(layout.eosOffset,layout.footer?.offset??original.length));
 if(layout.footer){const footer=JSON.parse(exportArrowFlatbufferModel(layout.footer.metadata));rename(footer.value.schema);
  for(const key of ['dictionaries','recordBatches'])for(const block of footer.value[key]??[]){const offset=offsets.get(Number(BigInt(block.offset)));if(offset===undefined)throw new UmfError('ARROW_IPC_RENAME_FOOTER','Unknown block offset');block.offset=String(offset);}
  const encoded=encodeArrowFlatbuffer(importArrowFlatbufferModel(JSON.stringify(footer),{id:document.id+'/renamed-footer'}),backend);append(encoded);const tail=new Uint8Array(10);new DataView(tail.buffer).setInt32(0,encoded.length,true);tail.set(new TextEncoder().encode('ARROW1'),4);append(tail);
 }
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 // Keep all caller-owned envelope/extension content in both source and candidate.
 const candidate=copyJson(document) as unknown as Document;const captured=captureArrowIpc(bytes,{id:document.id});
 candidate.modules.find(m=>m.id==='ipc')!.elements.find(e=>e.id==='source')!.extensions[ARROW_IPC_EXTENSION]=captured.modules[0]!.elements[0]!.extensions[ARROW_IPC_EXTENSION]!;
 const validation=inspectArrowIpcConsistency(candidate);if(!validation.layout.bytesAccountedFor||validation.layout.diagnostics.some(d=>d.severity==='error')||!['matched','not-applicable'].includes(validation.footerChecks))throw new UmfError('ARROW_IPC_RENAME_RESULT','Renamed IPC failed structural consistency checks');
 if(validation.layout.frames.length!==layout.frames.length)throw new UmfError('ARROW_IPC_RENAME_RESULT','Frame count changed');
 for(let i=1;i<layout.frames.length;i++){const a=layout.frames[i]!,b=validation.layout.frames[i]!;const before=original.subarray(a.offset,a.bodyOffset+a.bodyLength),after=bytes.subarray(b.offset,b.bodyOffset+b.bodyLength);if(before.length!==after.length||before.some((v,j)=>v!==after[j]))throw new UmfError('ARROW_IPC_RENAME_RESULT','Record/dictionary message changed');}
 return {source:copyJson(document) as unknown as Document,document:candidate,complete:false,bodyBytesPreserved:true,validation,diagnostics:[{code:'ARROW_IPC_NAME_REFERENCES_UNVERIFIED',path:'',severity:'warning',message:'Metadata and external references may still use the old field name; uninterpreted metadata was preserved without rewriting references'},{code:'ARROW_IPC_DATA_UNVERIFIED',path:'',severity:'warning',message:'Record/dictionary messages remain byte-identical; this does not establish their original semantic validity'}]};
}
