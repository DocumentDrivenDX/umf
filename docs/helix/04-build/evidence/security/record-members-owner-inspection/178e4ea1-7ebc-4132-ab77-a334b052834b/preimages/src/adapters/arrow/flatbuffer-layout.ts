import inventory from '../../../spec/extensions/arrow/flatbuffer-inventory.json';
export type Field={name:string;type:string;required:boolean};
export type Decl={name:string;kind:string;base?:string;fields?:Field[];members?:{name:string;value:number}[]};
export const declarations=new Map<string,Decl>((inventory.definitions as Decl[]).map(d=>[d.name,d]));
export const shortName=(name:string)=>name.replace('org.apache.arrow.flatbuf.','');
const align=(n:number,a:number)=>Math.ceil(n/a)*a;
export function layout(name:string):{size:number;alignment:number;fields?:{field:Field;offset:number}[]}{
 name=shortName(name);const size=({bool:1,byte:1,short:2,int:4,long:8} as Record<string,number>)[name];if(size)return {size,alignment:size};
 const d=declarations.get(name);if(d?.kind==='enum')return layout(d.base!);
 if(d?.kind==='struct'){let offset=0,alignment=1;const fields=d.fields!.map(field=>{const l=layout(field.type);alignment=Math.max(alignment,l.alignment);offset=align(offset,l.alignment);const result={field,offset};offset+=l.size;return result;});return {size:align(offset,alignment),alignment,fields};}
 return {size:4,alignment:4};
}
