import {captureArrowIpc} from './capture';
import {importArrowFlatbufferModel} from './flatbuffer-model';
import {LIMITS} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import {declarations,shortName,layout,type Decl} from './flatbuffer-layout';
export type ArrowFlatbufferRoot='Schema'|'Message'|'Footer'|'Tensor'|'SparseTensor';
/** Decodes a raw, non-size-prefixed FlatBuffer metadata root, not an IPC container. */
export function decodeArrowFlatbuffer(bytes:Uint8Array,options:{id:string;rootType:ArrowFlatbufferRoot}):{source:Document;model?:Document;complete:false;status:'decoded'|'uninterpreted';diagnostics:Diagnostic[]}{
 const source=captureArrowIpc(bytes,{id:options.id+'/source'});const data=new Uint8Array(bytes);const view=new DataView(data.buffer);const diagnostics:Diagnostic[]=[];
 const fail=(message:string):never=>{throw new UmfError('ARROW_FLATBUFFER_DECODE',message);};
 function bounds(pos:number,size:number){if(!Number.isSafeInteger(pos)||!Number.isSafeInteger(size)||pos<0||size<0||pos+size>data.length)fail('Metadata offset outside captured bytes');}
 function u16(pos:number){bounds(pos,2);return view.getUint16(pos,true);}
 function u32(pos:number){bounds(pos,4);return view.getUint32(pos,true);}
 function indirect(pos:number){const offset=u32(pos);if(offset<4)fail('Null/backward object offset');const target=pos+offset;bounds(target,4);return target;}
 let visited=0;
 function read(name:string,pos:number,depth:number,path:string):any{
  if(++visited>LIMITS.maxValues||depth>LIMITS.maxDepth)fail('Metadata traversal limit exceeded');name=shortName(name);
  const l=layout(name);bounds(pos,l.size);if(pos%l.alignment)fail('Misaligned metadata field');
  if(name==='bool'){const value=view.getUint8(pos);if(value>1)fail('Invalid boolean');return !!value;}
  if(name==='byte')return view.getInt8(pos);if(name==='short')return view.getInt16(pos,true);if(name==='int')return view.getInt32(pos,true);if(name==='long')return view.getBigInt64(pos,true).toString();
  if(name==='string'){const start=indirect(pos),length=u32(start);bounds(start+4,length+1);if(data[start+4+length]!==0)fail('String lacks terminator');return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data.subarray(start+4,start+4+length));}
  const vector=/^\[\s*([\w.]+)\s*\]$/.exec(name);
  if(vector){const start=indirect(pos),length=u32(start),itemType=vector[1]!,itemLayout=layout(itemType);if(length>LIMITS.maxValues-visited)fail('Metadata vector exceeds traversal limit');bounds(start+4,length*itemLayout.size);return Array.from({length},(_,i)=>read(itemType,start+4+i*itemLayout.size,depth+1,path+'/'+i));}
  const d=declarations.get(name);if(!d)fail('Unknown metadata declaration '+name);
  if(d!.kind==='enum'){const value=read(d!.base!,pos,depth+1,path);const member=d!.members!.find(m=>String(m.value)===String(value));if(!member)fail('Unknown '+name+' enum value '+value+' at '+path);return member!.name;}
  if(d!.kind==='struct'){const result:Record<string,unknown>=Object.create(null);for(const f of l.fields!)result[f.field.name]=read(f.field.type,pos+f.offset,depth+1,path+'/'+f.field.name);return result;}
  if(d!.kind!=='table')fail('Unexpected standalone union');
  const table=indirect(pos);return tableAt(d!,table,depth,path);
 }
 function tableAt(d:Decl,table:number,depth:number,path:string):any{
  if(depth>LIMITS.maxDepth)fail('Metadata depth exceeded');bounds(table,4);if(table%4)fail('Misaligned table');
  const vt=table-view.getInt32(table,true);const length=u16(vt),objectSize=u16(vt+2);if(vt%2||length<4||length%2||objectSize<4)fail('Invalid vtable');bounds(vt,length);bounds(table,objectSize);
  function slot(index:number,size:number){const entry=4+index*2;if(entry>=length)return undefined;const offset=u16(vt+entry);if(!offset)return undefined;if(offset<4||offset+size>objectSize)fail('Field lies outside its table');return table+offset;}
  const result:Record<string,unknown>=Object.create(null);let index=0;
  for(const field of d.fields!){const type=shortName(field.type),member=declarations.get(type);const fieldPath=path+'/'+field.name;
   if(member?.kind==='union'){
    const tagPos=slot(index++,1),valuePos=slot(index++,4);const tag=tagPos===undefined?0:view.getUint8(tagPos);
    if(tag===0){if(valuePos!==undefined)fail('NONE union has a value');if(tagPos!==undefined)result[field.name]={type:'NONE'};continue;}
    const variant=member.members!.find(m=>m.value===tag);if(!variant)fail('Unknown '+type+' union tag '+tag+' at '+fieldPath);if(valuePos===undefined)fail('Union tag lacks value');
    result[field.name]={type:variant!.name,value:read(variant!.name,valuePos!,depth+1,fieldPath+'/value')};
   }else{const position=slot(index++,layout(type).size);if(position!==undefined)result[field.name]=read(type,position,depth+1,fieldPath);}
  }
  for(;4+index*2<length;index++)if(u16(vt+4+index*2)!==0)diagnostics.push({code:'ARROW_FLATBUFFER_UNKNOWN_SLOT',path,severity:'warning',message:'Unknown table slot '+index+' retained in source bytes at vtable '+vt});
  return result;
 }
 try{
  if(!['Schema','Message','Footer','Tensor','SparseTensor'].includes(options.rootType))fail('Unsupported metadata root');
  const value=read(options.rootType,0,0,'');const model=importArrowFlatbufferModel(JSON.stringify({rootType:options.rootType,value}),{id:options.id});
  if(diagnostics.some(d=>d.code==='ARROW_FLATBUFFER_UNKNOWN_SLOT'))(model.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as any).wireOmissions=diagnostics.map(d=>({path:d.path,message:d.message}));
  diagnostics.push({code:'ARROW_FLATBUFFER_INCOMPLETE',path:'',severity:'warning',message:'Known metadata decoded with physical field presence; full wire verification, IPC framing, data and Arrow semantics remain unverified'});
  return {source,model,complete:false,status:'decoded',diagnostics};
 }catch(error){diagnostics.push({code:'ARROW_FLATBUFFER_DECODE',path:'',severity:'error',message:error instanceof Error?error.message:'Metadata decode failed'});return {source,complete:false,status:'uninterpreted',diagnostics};}
}
