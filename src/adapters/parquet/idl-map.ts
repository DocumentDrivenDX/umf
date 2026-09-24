import idl from '../../../spec/extensions/parquet/idl.json';
import type {ParquetWireValue} from './footer';
import type {Diagnostic,Json} from '../../model/types';
export function mapParquetIdl(value:ParquetWireValue,ref:string,diagnostics:Diagnostic[]):Json{
 const defs=idl.definitions as Record<string,any>,decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 const fail=(path:string,message:string):never=>{diagnostics.push({code:'PARQUET_METADATA_SHAPE',path,severity:'error',message});throw Error(message);};
 const wireKind=(t:any):string=>t.ref?(defs[t.ref]?.kind==='enum'?'i32':'struct'):t.kind==='string'?'binary':t.kind;
 function map(n:ParquetWireValue,t:any,path:string):any{
  if(t.ref){const d=defs[t.ref];if(!d)fail(path,'Unknown IDL reference');if(d.kind==='enum'){if(n.kind!=='i32')fail(path,'Expected i32 enumeration');const value=(n as {value:string}).value;if(!Object.values(d.values).some(v=>String(v)===value))diagnostics.push({code:'PARQUET_ENUM_UNKNOWN',path,severity:'warning',message:'Unknown '+t.ref+' code retained: '+value});return value;}
   if(n.kind!=='struct')return fail(path,'Expected struct '+t.ref);const out:Record<string,Json>=Object.create(null),seen=new Set<number>(),unknown:any[]=[];if(d.kind==='union'&&n.fields.length>1)fail(path,'Union has more than one active field');
   for(const f of n.fields){const field=d.fields.find((x:any)=>x.id===f.id);if(field&&seen.has(f.id))fail(path,'Repeated field ID cannot be collapsed into named metadata: '+f.id);seen.add(f.id);if(field)out[field.name]=map(f.value,field.type,path+'/'+field.name);else{unknown.push(f);diagnostics.push({code:'PARQUET_FIELD_UNKNOWN',path,severity:'warning',message:'Unknown field '+f.id+' retained in $unknown'});}}
   for(const f of d.fields)if(f.required&&!seen.has(f.id))fail(path+'/'+f.name,'Missing required IDL field');if(unknown.length)out.$unknown=unknown;return out;
  }
  if(t.kind==='string'){if(n.kind!=='binary')return fail(path,'Expected string wire bytes');try{return decoder.decode(Uint8Array.from(n.hex.match(/../g)??[],b=>Number.parseInt(b,16)));}catch{return fail(path,'IDL string is not valid UTF-8');}}
  if(t.kind==='binary'){if(n.kind!=='binary')return fail(path,'Expected binary wire value');return {hex:n.hex};}
  if(t.kind==='bool'){if(n.kind!=='bool')return fail(path,'Expected boolean');return n.value;}
  if(['i8','i16','i32','i64'].includes(t.kind)){if(n.kind!==t.kind)return fail(path,'Integer width does not match IDL');return (n as {value:string}).value;}
  if(t.kind==='double'){if(n.kind!=='double')return fail(path,'Expected double');return {bits:n.bits};}
  if(t.kind==='list'||t.kind==='set'){if(n.kind!==t.kind)return fail(path,'Collection kind does not match IDL');if((n as {elementType:string}).elementType!==wireKind(t.item))return fail(path,'Collection element type does not match IDL');return (n as {items:ParquetWireValue[]}).items.map((v,i)=>map(v,t.item,path+'/'+i));}
  if(t.kind==='map'){if(n.kind!=='map')return fail(path,'Expected map');if(n.entries.length&&(n.keyType!==wireKind(t.key)||n.valueType!==wireKind(t.value)))return fail(path,'Map element types do not match IDL');return n.entries.map((e,i)=>({key:map(e.key,t.key,path+'/'+i+'/key'),value:map(e.value,t.value,path+'/'+i+'/value')}));}
  return fail(path,'Unsupported IDL descriptor');
 }
 return map(value,{ref},'');
}
