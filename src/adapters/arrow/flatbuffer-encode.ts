import {exportArrowFlatbufferModel} from './flatbuffer-model';
import {decodeArrowFlatbuffer} from './flatbuffer-decode';
import {declarations,shortName} from './flatbuffer-layout';
import {ARROW_IPC_MAX_BYTES} from './capture';
import {UmfError,type Document} from '../../model/types';
export interface ArrowFlatbufferEncodingBackend{identity:'flatbuffers@25.9.23';encode(model:unknown):Uint8Array;}
function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
/** Encodes one logical metadata root. Never rewrites an archived IPC dataset. */
export function encodeArrowFlatbuffer(document:Document,backend:ArrowFlatbufferEncodingBackend):Uint8Array{
 if(backend?.identity!=='flatbuffers@25.9.23'||typeof backend.encode!=='function')throw new UmfError('ARROW_BACKEND','Expected explicit pinned FlatBuffers backend');
 const text=exportArrowFlatbufferModel(document),input=JSON.parse(text);
 function known(type:string,value:any){type=shortName(type);if(type.startsWith('[')){for(const v of value)known(type.slice(1,-1).trim(),v);return;}const d=declarations.get(type);if(!d||d.kind==='enum')return;if(d.kind==='union'){if(value.type!=='NONE')known(value.type,value.value);return;}
  for(const key of Object.keys(value)){const field=d.fields!.find(f=>f.name===key);if(!field)throw new UmfError('ARROW_FLATBUFFER_UNKNOWN','Unknown metadata property cannot be dropped: '+type+'.'+key);known(field.type,value[key]);}
 }
 known(input.rootType,input.value);const output=backend.encode(JSON.parse(text));
 if(!(output instanceof Uint8Array)||!output.length||output.length>ARROW_IPC_MAX_BYTES)throw new UmfError('ARROW_FLATBUFFER_BYTES','Expected bounded metadata bytes');
 const decoded=decodeArrowFlatbuffer(output,{id:document.id+'/encoded',rootType:input.rootType});
 if(!decoded.model||decoded.diagnostics.some(d=>d.code!=='ARROW_FLATBUFFER_INCOMPLETE')||canonical(JSON.parse(exportArrowFlatbufferModel(decoded.model)))!==canonical(input))throw new UmfError('ARROW_FLATBUFFER_LOSS','Encoded metadata changed values or physical field presence');
 return new Uint8Array(output);
}
