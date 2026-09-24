// Optional inventory-driven encoder; the public API performs preservation checks.
import {Builder} from 'flatbuffers';
import {declarations,layout,shortName} from '../../src/adapters/arrow/flatbuffer-layout';
export const flatbufferBackend={identity:'flatbuffers@25.9.23' as const,encode(input:any):Uint8Array{
 const b=new Builder(1024);b.forceDefaults(true);
 function scalar(type:string,value:any):[string,any]{type=shortName(type);const d=declarations.get(type);if(d?.kind==='enum')return [d.base!,d.members!.find(m=>m.name===value)!.value];return [type,type==='long'?BigInt(value):type==='bool'?Number(value):value];}
 function write(type:string,value:any){const [t,v]=scalar(type,value);if(t==='long')b.writeInt64(BigInt(v));else if(t==='int')b.writeInt32(v);else if(t==='short')b.writeInt16(v);else b.writeInt8(v);}
 function struct(type:string,value:any){const l=layout(type);b.prep(l.alignment,l.size);let end=l.size;for(const f of [...l.fields!].reverse()){const size=layout(f.field.type).size;b.pad(end-f.offset-size);write(f.field.type,value[f.field.name]);end=f.offset;}b.pad(end);return b.offset();}
 function offset(type:string,value:any):number{
  type=shortName(type);if(type==='string')return b.createString(value);
  const vector=/^\[\s*([\w.]+)\s*\]$/.exec(type);
  if(vector){const child=shortName(vector[1]!),d=declarations.get(child),l=layout(child);const pointers=child==='string'||d?.kind==='table';const values=pointers?value.map((v:any)=>offset(child,v)):value;
   b.startVector(l.size,values.length,l.alignment);for(let i=values.length-1;i>=0;i--){if(pointers)b.addOffset(values[i]);else if(d?.kind==='struct')struct(child,values[i]);else write(child,values[i]);}return b.endVector();
  }
  const d=declarations.get(type)!;const prepared=new Map<string,number>();let count=0;
  for(const f of d.fields!){const t=shortName(f.type),child=declarations.get(t);count+=child?.kind==='union'?2:1;if(!Object.hasOwn(value,f.name))continue;
   if(child?.kind==='union'){if(value[f.name].type!=='NONE')prepared.set(f.name,offset(value[f.name].type,value[f.name].value));}
   else if(t==='string'||t.startsWith('[')||child?.kind==='table')prepared.set(f.name,offset(t,value[f.name]));
  }
  b.startObject(count);let slot=0;
  for(const f of d.fields!){const t=shortName(f.type),child=declarations.get(t),index=slot;slot+=child?.kind==='union'?2:1;if(!Object.hasOwn(value,f.name))continue;const v=value[f.name];
   if(child?.kind==='union'){const tag=v.type==='NONE'?0:child.members!.find(m=>m.name===v.type)!.value;b.addFieldInt8(index,tag,0);if(tag)b.addFieldOffset(index+1,prepared.get(f.name)!,0);}
   else if(prepared.has(f.name))b.addFieldOffset(index,prepared.get(f.name)!,0);
   else if(child?.kind==='struct')b.addFieldStruct(index,struct(t,v),0);
   else{const [kind,n]=scalar(t,v);if(kind==='long')b.addFieldInt64(index,BigInt(n),0n);else if(kind==='int')b.addFieldInt32(index,n,0);else if(kind==='short')b.addFieldInt16(index,n,0);else b.addFieldInt8(index,n,0);}
  }
  return b.endObject();
 }
 b.finish(offset(input.rootType,input.value));return new Uint8Array(b.asUint8Array());
}};
