import {inspectParquetContainers} from './containers';
import type {ParquetSchemaNode} from './schema';
import {decodeParquetFooter,type ParquetWireValue} from './footer';
import {rewriteParquetFooter,unsafeParquetMetadata} from './rewrite';
import {copyJson} from '../../model/json';
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetRenameResult {source:Document;status:'transformed'|'blocked';complete:false;diagnostics:Diagnostic[];output?:Document;rename?:{index:number;from:string[];to:string[]};unchangedPrefixBytes?:number}
/** Rename by stable native schema index, with simultaneous descendant column-path updates. */
export function renameParquetField(source:Document,index:number,name:string):ParquetRenameResult {
 const before=inspectParquetContainers(source),r:ParquetRenameResult={source:before.source,status:'blocked',complete:false,diagnostics:[...before.diagnostics]};
 const fail=(message:string)=>{r.diagnostics.push({code:'PARQUET_RENAME_BLOCKED',path:'/schema/'+index,severity:'error',message});return r;};
 if(before.status!=='checked')return r;
 if(!Number.isInteger(index)||index<=0)return fail('Expected a non-root schema index');
 const encoder=new TextEncoder();if(typeof name!=='string'||name.length===0||name.length>100000||new TextDecoder('utf-8',{ignoreBOM:true}).decode(encoder.encode(name))!==name)return fail('Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units');
 const metadata=before.metadata as any;if(unsafeParquetMetadata(metadata)||before.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN'))return fail('Unknown or crypto metadata prevents schema editing');
 if(decodeParquetFooter(source).trailingBytes!==0)return fail('Footer trailers cannot be rewritten');
 const references=(v:any):boolean=>!!(v&&typeof v==='object'&&(Object.entries(v).some(([k,x])=>k==='key_value_metadata'&&Array.isArray(x)&&x.length>0||k==='file_path')||Object.values(v).some(references)));
 if(references(metadata))return fail('Key/value metadata or external column files may contain schema references; an explicit rewrite policy is required');
 if(before.annotations?.some(a=>a.validation!=='checked'&&!['LIST','MAP','MAP_KEY_VALUE'].includes(a.name)))return fail('Uninterpreted logical annotations prevent safe rename');
 let selected:ParquetSchemaNode|undefined,parent:ParquetSchemaNode|undefined;
 function find(n:ParquetSchemaNode,p?:ParquetSchemaNode){if(n.index===index){selected=n;parent=p;}for(const child of n.children)find(child,n);}find(before.tree!);
 if(!selected||!parent)return fail('Schema index does not identify a field');const target:ParquetSchemaNode=selected;
 if(target.name===name)return fail('Rename must change the field name');if(parent.children.some(n=>n.index!==index&&n.name===name))return fail('Sibling name collision');
 if(before.diagnostics.some(d=>d.code==='PARQUET_DUPLICATE_FIELD_NAME'))return fail('Ambiguous existing sibling names prevent rename');
 const binary=(s:string):ParquetWireValue=>({kind:'binary',hex:Array.from(encoder.encode(s),b=>b.toString(16).padStart(2,'0')).join('')});
 const field=(v:ParquetWireValue,id:number):ParquetWireValue=>{if(v.kind!=='struct')throw Error('Expected metadata struct');const found=v.fields.find(f=>f.id===id);if(!found)throw Error('Required metadata field missing');return found.value;};
 const items=(v:ParquetWireValue)=>{if(v.kind!=='list')throw Error('Expected metadata list');return v.items;};
 try{
  const tree=copyJson(before.wire!) as ParquetWireValue,schema=items(field(tree,2)),entry=schema[index]!;if(entry.kind!=='struct')throw Error('Expected schema element');entry.fields.find(f=>f.id===4)!.value=binary(name);
  const affected=new Set<number>();const collect=(n:ParquetSchemaNode)=>{affected.add(n.index);for(const c of n.children)collect(c);};collect(target);
  for(const group of items(field(tree,4))){const columns=items(field(group,1));for(const leaf of before.leaves!){if(!affected.has(leaf.index))continue;const column=field(columns[leaf.ordinal]!,3),path=items(field(column,3));path[target.path.length-1]=binary(name);}}
  const {output,unchangedPrefixBytes}=rewriteParquetFooter(source,tree),after=inspectParquetContainers(output);
  if(after.status!=='checked')return fail('Renamed schema failed structural/logical checks');
  if(JSON.stringify(before.containers)!==JSON.stringify(after.containers))return fail('Rename changes legacy LIST/MAP interpretation');
  r.output=output;r.rename={index,from:[...target.path],to:[...target.path.slice(0,-1),name]};r.unchangedPrefixBytes=unchangedPrefixBytes;r.status='transformed';
  r.diagnostics.push({code:'PARQUET_RENAME_SCOPE',path:'/schema/'+index,severity:'warning',message:'Schema name and descendant column paths changed; all bytes before footer are unchanged. External consumers that refer to old names require migration'});return r;
 }catch(e){return fail((e as Error).message);}
}
