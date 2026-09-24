import {createHash} from 'node:crypto';
import {captureArrowIpc,exportArrowIpcCapture,inspectArrowIpcConsistency,renameArrowIpcField,readDocument,writeDocument} from '../src';
import {flatbufferBackend} from '../native/arrow/flatbuffer-runtime';
const base='fixtures/arrow/upstream/';const manifest=await Bun.file(base+'manifest.json').json();const results=[];
if(manifest.commit!=='9ff285c88565f0f6abc855918c6a342e70e4909c'||manifest.files.length!==275)throw Error('Pinned corpus inventory changed');
for(const c of manifest.files.filter((f:any)=>/\.(stream|arrow_file)$/.test(f.path))){
 const bytes=new Uint8Array(await Bun.file(base+c.path).arrayBuffer());const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');if(hash(bytes)!==c.sha256)throw Error('Upstream fixture hash '+c.path);
 const doc=captureArrowIpc(bytes,{id:c.path});for(const format of ['json','yaml'] as const)if(hash(exportArrowIpcCapture(readDocument(writeDocument(doc,format),format)))!==c.sha256)throw Error('Capture changed '+c.path);
 const report=inspectArrowIpcConsistency(doc);let renameStatus='blocked',reason='';
 try{const changed=renameArrowIpcField(doc,{fieldPath:[0],name:'umf_renamed_field',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend);await Bun.write(base+'transformed/'+c.path,exportArrowIpcCapture(changed.document));renameStatus='renamed';}catch(error){reason=(error as Error).message;}
 results.push({path:c.path,capture:'exact-json-yaml',framed:report.layout.bytesAccountedFor,footerChecks:report.footerChecks,renameStatus,...(reason?{reason}:{}),diagnostics:[...report.layout.diagnostics,...report.diagnostics].filter(d=>!['ARROW_FLATBUFFER_INCOMPLETE','ARROW_IPC_SEMANTICS_UNVERIFIED'].includes(d.code))});
 if(results.length%25===0)console.log({checked:results.length});
}
const output={commit:manifest.commit,cases:results.length,renamed:results.filter(r=>r.renameStatus==='renamed').length,results};
const blocked=results.filter(r=>r.renameStatus==='blocked');
if(output.cases!==182||output.renamed!==179||blocked.map(r=>r.path).join(',')!=='0.14.1/generated_decimal.arrow_file,0.14.1/generated_primitive_no_batches.arrow_file,0.14.1/generated_primitive_zerolength.arrow_file'||blocked.some(r=>!r.framed||r.diagnostics.length!==1||r.diagnostics[0]?.code!=='ARROW_IPC_FOOTER_VERSION'))throw Error('Upstream outcome baseline changed; inspect before updating support claims');
await Bun.write(base+'results.json',JSON.stringify(output,null,2)+'\n');console.log({cases:output.cases,renamed:output.renamed,blocked:results.filter(r=>r.renameStatus==='blocked').map(r=>({path:r.path,reason:r.reason,diagnostics:r.diagnostics}))});
