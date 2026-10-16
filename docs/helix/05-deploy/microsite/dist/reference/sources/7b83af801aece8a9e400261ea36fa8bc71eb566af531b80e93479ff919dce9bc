import {inspectArrowIpcLayout,type ArrowIpcLayout} from './ipc-layout';
import {declarations,shortName} from './flatbuffer-layout';
import type {Document,Diagnostic} from '../../model/types';
export interface ArrowIpcConsistency {layout:ArrowIpcLayout;complete:false;footerChecks:'not-applicable'|'matched'|'mismatch'|'unverified';diagnostics:Diagnostic[];}
function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
// Compare interpreted scalar defaults and empty vectors, without changing source presence.
function normalized(type:string,value:any):any{
 type=shortName(type);if(type.startsWith('['))return (value??[]).map((v:any)=>normalized(type.slice(1,-1).trim(),v));const d=declarations.get(type);if(!d||d.kind==='enum')return value;
 if(d.kind==='union')return value.type==='NONE'?value:{type:value.type,value:normalized(value.type,value.value)};
 const result:Record<string,unknown>={};
 for(const f of d.fields!){const t=shortName(f.type),child=declarations.get(t);let v=value[f.name];
  if(v===undefined){const explicit=(f as any).default;if(explicit!==undefined)v=t==='bool'?explicit==='true':t==='int'?Number(explicit):explicit;else if(t.startsWith('['))v=[];else if(t==='bool')v=false;else if(t==='int')v=0;else if(t==='long')v='0';else if(child?.kind==='enum')v=child.members!.find(m=>m.value===0)?.name;}
  if(v!==undefined)result[f.name]=normalized(t,v);
 }
 return result;
}
const payload=(doc:Document)=>(doc.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as any);
/** Compares file footer declarations to observed embedded-stream metadata and extents. */
export function inspectArrowIpcConsistency(document:Document):ArrowIpcConsistency{
 const layout=inspectArrowIpcLayout(document),diagnostics:Diagnostic[]=[];const result:ArrowIpcConsistency={layout,complete:false,footerChecks:'unverified',diagnostics};
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path,message,severity});
 if(layout.format==='stream'){result.footerChecks='not-applicable';return result;}
 if(!layout.bytesAccountedFor||!layout.footer||layout.diagnostics.some(d=>d.severity==='error')){add('ARROW_IPC_FOOTER_UNVERIFIED','/footer','Complete file boundaries are required for footer comparison','warning');return result;}
 if(layout.diagnostics.some(d=>d.code==='ARROW_FLATBUFFER_UNKNOWN_SLOT')){add('ARROW_IPC_FOOTER_UNVERIFIED','/footer','Unknown metadata wire slots prevent complete footer comparison','warning');return result;}
 const footer=payload(layout.footer.metadata).model.value,first=payload(layout.frames[0]!.metadata).model.value;
 if((footer.version??'V1')!==(first.version??'V1'))add('ARROW_IPC_FOOTER_VERSION','/footer/version','Footer and schema-message metadata versions differ');
 if(!footer.schema||canonical(normalized('Schema',footer.schema))!==canonical(normalized('Schema',first.header.value)))add('ARROW_IPC_FOOTER_SCHEMA','/footer/schema','Footer schema differs from the embedded-stream schema');
 if(canonical(footer.custom_metadata??[])!==canonical(first.custom_metadata??[]))add('ARROW_IPC_FOOTER_METADATA','/footer/custom_metadata','Footer and initial message custom metadata differ');
 for(const [key,kind] of [['dictionaries','DictionaryBatch'],['recordBatches','RecordBatch']] as const){
  const frames=layout.frames.filter(f=>f.kind===kind),blocks=footer[key]??[],seen=new Set<number>();
  if(blocks.length!==frames.length)add('ARROW_IPC_FOOTER_BLOCK_COUNT','/footer/'+key,'Footer block count differs from observed '+kind+' messages');
  for(let i=0;i<blocks.length;i++){const block=blocks[i],offset=BigInt(block.offset),frame=frames.find(f=>BigInt(f.offset)===offset),path='/footer/'+key+'/'+i;
   if(!frame){add('ARROW_IPC_FOOTER_BLOCK_OFFSET',path,'Block offset does not identify a '+kind+' message');continue;}
   if(seen.has(frame.offset))add('ARROW_IPC_FOOTER_BLOCK_DUPLICATE',path,'Footer repeats the same message offset');seen.add(frame.offset);
   if(block.metaDataLength!==frame.prefixLength+frame.metadataLength||BigInt(block.bodyLength)!==BigInt(frame.bodyLength))add('ARROW_IPC_FOOTER_BLOCK_LENGTH',path,'Footer metadata/body lengths differ from observed message extents');
   if(frames[i]!==frame)add('ARROW_IPC_FOOTER_BLOCK_ORDER',path,'Footer order differs from stream order; ordering agreement is a writer recommendation','warning');
  }
 }
 result.footerChecks=diagnostics.length?'mismatch':'matched';return result;
}
