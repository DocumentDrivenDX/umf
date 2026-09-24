import {exportArrowIpcCapture} from './capture';
import {decodeArrowFlatbuffer} from './flatbuffer-decode';
import {copyJson} from '../../model/json';
import type {Document,Diagnostic} from '../../model/types';
export interface ArrowIpcFrame {offset:number;prefixLength:number;metadataOffset:number;metadataLength:number;bodyOffset:number;bodyLength:number;kind:string;metadata:Document;}
export interface ArrowIpcLayout {source:Document;format:'stream'|'file';complete:false;bytesAccountedFor:boolean;frames:ArrowIpcFrame[];footer?:{offset:number;length:number;metadata:Document};eosOffset?:number;consumed:number;trailingBytes:number;diagnostics:Diagnostic[];}
/** Inspects encapsulated metadata/body boundaries; does not execute array or dictionary semantics. */
export function inspectArrowIpcLayout(document:Document):ArrowIpcLayout{
 const bytes=exportArrowIpcCapture(document),view=new DataView(bytes.buffer);const magic=(offset:number)=>offset>=0&&String.fromCharCode(...bytes.subarray(offset,offset+6))==='ARROW1';
 const result:ArrowIpcLayout={source:copyJson(document) as unknown as Document,format:magic(0)?'file':'stream',complete:false,bytesAccountedFor:false,frames:[],consumed:0,trailingBytes:bytes.length,diagnostics:[]};
 let pos=0,end=bytes.length;
 const error=(message:string):never=>{throw Error(message);};
 function bounded(offset:number,length:number,limit=end){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>limit)error('Truncated or out-of-bounds IPC segment');}
 function i32(offset:number){bounded(offset,4);return view.getInt32(offset,true);}
 try{
  if(result.format==='file'){
   if(bytes.length<18||!magic(bytes.length-6))error('Missing IPC file footer magic');
   const length=view.getInt32(bytes.length-10,true);if(length<=0)error('Invalid footer length');const offset=bytes.length-10-length;if(offset<8)error('Footer overlaps file header');
   const decoded=decodeArrowFlatbuffer(bytes.slice(offset,offset+length),{id:document.id+'/footer',rootType:'Footer'});if(!decoded.model)error('Cannot decode file footer');
   result.footer={offset,length,metadata:decoded.model!};result.diagnostics.push(...decoded.diagnostics.map(d=>({...d,path:'/footer'+d.path})));end=offset;pos=8;
  }
  while(pos<end){
   if(result.frames.length>=1024)error('IPC frame-count limit exceeded');const start=pos;let length=i32(pos),prefixLength=4;
   if(length===-1){length=i32(pos+4);prefixLength=8;}
   if(length<0)error('Negative metadata length');
   if(length===0){result.eosOffset=start;pos+=prefixLength;break;}
   bounded(pos+prefixLength,length);if((prefixLength+length)%8!==0)error('IPC metadata framing is not aligned to eight bytes');
   const metadataOffset=pos+prefixLength,bodyOffset=metadataOffset+length;
   const decoded=decodeArrowFlatbuffer(bytes.slice(metadataOffset,bodyOffset),{id:document.id+'/message/'+result.frames.length,rootType:'Message'});
   if(!decoded.model)error('Cannot decode message metadata: '+decoded.diagnostics.at(-1)?.message);
   // Unknown wire slots prohibit standalone model export; inspect the preserved model
   // directly for the known bodyLength while retaining its omission marker/diagnostics.
   const payload=decoded.model!.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as any;const message=payload.model.value;
   const body=BigInt(message.bodyLength??'0');if(body<0n||body>BigInt(bytes.length))error('Invalid or oversized message body length');const bodyLength=Number(body);if(bodyLength%8)error('IPC body length is not aligned to eight bytes');bounded(bodyOffset,bodyLength);
   result.frames.push({offset:start,prefixLength,metadataOffset,metadataLength:length,bodyOffset,bodyLength,kind:message.header?.type??'NONE',metadata:decoded.model!});result.diagnostics.push(...decoded.diagnostics.map(d=>({...d,path:'/frames/'+(result.frames.length-1)+d.path})));pos=bodyOffset+bodyLength;
  }
  if(!result.frames.length||result.frames[0]!.kind!=='Schema')error('IPC stream must begin with a schema message');
  if(result.format==='file'&&result.eosOffset===undefined)error('File embedded stream lacks EOS');
  if(pos!==end)result.diagnostics.push({code:'ARROW_IPC_TRAILING',path:'',severity:'warning',message:(end-pos)+' bytes after EOS remain uninterpreted'});
  else{result.bytesAccountedFor=true;if(result.format==='file')pos=bytes.length;}
 }catch(e){result.diagnostics.push({code:'ARROW_IPC_FRAMING',path:'',severity:'error',message:e instanceof Error?e.message:'Framing failed'});}
 result.consumed=pos;result.trailingBytes=result.bytesAccountedFor?0:Math.max(0,end-pos);
 result.diagnostics.push({code:'ARROW_IPC_SEMANTICS_UNVERIFIED',path:'',severity:'warning',message:'Byte boundaries are separate from footer/block agreement, schema consistency, dictionary state, buffer layouts and data validity'});
 return result;
}
