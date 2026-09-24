import {getParquetArrowSchema} from './arrow-schema';
import {inspectParquetContainers} from './containers';
import {decodeParquetFooter,type ParquetWireValue} from './footer';
import {rewriteParquetFooter,unsafeParquetMetadata} from './rewrite';
import {renameParquetField} from './rename';
import {exportArrowFlatbufferModel,importArrowFlatbufferModel} from '../arrow/flatbuffer-model';
import {encodeArrowFlatbuffer,type ArrowFlatbufferEncodingBackend} from '../arrow/flatbuffer-encode';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
export interface ParquetArrowRenamePolicy {parquetIndex:number;arrowFieldPath:number[];name:string;parquetName?:string;uninterpretedMetadata:'preserve-and-report'}
export interface ParquetArrowRenameResult {source:Document;policy:ParquetArrowRenamePolicy;status:'blocked'|'transformed';complete:false;diagnostics:Diagnostic[];output?:Document;unchangedPrefixBytes?:number;rename?:{from:string[];to:string[];parquetFrom?:string[];parquetTo?:string[]}}
/** Coordinated name edit using explicit native indexes and interpreted container roles. */
export function renameParquetFieldWithArrowSchema(input:Document,options:ParquetArrowRenamePolicy,backend:ArrowFlatbufferEncodingBackend):ParquetArrowRenameResult{
 const source=copyJson(input) as Document,policy=copyJson(options) as unknown as ParquetArrowRenamePolicy;
 if(!policy||typeof policy!=='object'||Object.keys(policy).some(k=>!['parquetIndex','arrowFieldPath','name','parquetName','uninterpretedMetadata'].includes(k))||!Number.isSafeInteger(policy.parquetIndex)||policy.parquetIndex<=0||!Array.isArray(policy.arrowFieldPath)||!policy.arrowFieldPath.length||policy.arrowFieldPath.length>64||policy.arrowFieldPath.some(i=>!Number.isSafeInteger(i)||i<0)||typeof policy.name!=='string'||Object.hasOwn(policy,'parquetName')&&typeof policy.parquetName!=='string'||policy.uninterpretedMetadata!=='preserve-and-report')throw new UmfError('PARQUET_ARROW_RENAME_POLICY','Explicit schema indexes, name and metadata preservation policy required');
 const result:ParquetArrowRenameResult={source,policy,status:'blocked',complete:false,diagnostics:[]};
 const fail=(message:string)=>{result.status='blocked';delete result.output;delete result.rename;delete result.unchangedPrefixBytes;result.diagnostics.push({code:'PARQUET_ARROW_RENAME_BLOCKED',path:'',severity:'error',message});return result;};
 const embedded=getParquetArrowSchema(source),physical=inspectParquetContainers(source);result.diagnostics.push(...embedded.diagnostics,...physical.diagnostics);
 if(embedded.status!=='decoded'||physical.status!=='checked')return fail('Decoded embedded Arrow and inspected physical schemas required');
 if(unsafeParquetMetadata(physical.metadata)||physical.diagnostics.some(d=>d.code==='PARQUET_ENUM_UNKNOWN')||decodeParquetFooter(source).trailingBytes!==0)return fail('Unknown, crypto or trailing footer content prevents rename');
 try{
  const message=JSON.parse(exportArrowFlatbufferModel(embedded.message!)),schema=message.value.header.value;
  const nodes=new Map<number,any>();const visit=(n:any)=>{nodes.set(n.index,n);n.children.forEach(visit);};visit(physical.tree!);
  const containers=new Map(physical.containers!.map(c=>[c.index,c])),mapEntries=new Set(physical.containers!.filter(c=>c.kind==='map').map(c=>c.repeatedIndex));
  let fields=schema.fields,field:any,siblings:any[]=[],candidates=physical.tree!.children,selected:any,roleName=false;const from:string[]=[];
  for(const [depth,index] of policy.arrowFieldPath.entries()){
   if(!Array.isArray(fields)||index>=fields.length)return fail('Arrow field path is absent');
   if(fields.length!==candidates.length)return fail('Arrow and Parquet child counts differ');
   if(new Set(fields.map((f:any)=>f.name)).size!==fields.length)return fail('Ambiguous Arrow sibling names');
   siblings=fields;field=fields[index];selected=candidates[index];from.push(field.name);
   if(!roleName&&selected.name!==field.name)return fail('Ordinary record fields require matching names and positions');
   if(depth===policy.arrowFieldPath.length-1)break;
   const container=containers.get(selected.index),type=field.type?.type;
   if(container?.kind==='list'){
    if(!['List','LargeList','FixedSizeList'].includes(type))return fail('LIST requires a corresponding Arrow list declaration');
    candidates=[nodes.get(container.elementIndex)];roleName=true;
   }else if(container?.kind==='map'){
    if(type!=='Map')return fail('MAP requires a corresponding Arrow map declaration');
    candidates=[nodes.get(container.repeatedIndex)];roleName=true;
   }else{
    if(type!=='Struct_')return fail('Nested record traversal requires an Arrow struct');
    candidates=selected.children;roleName=mapEntries.has(selected.index);
   }
   fields=field.children;
  }
  if(siblings.some(f=>f!==field&&f.name===policy.name))return fail('Arrow sibling name collision');
  if(!roleName&&policy.parquetName!==undefined&&policy.parquetName!==policy.name)return fail('Ordinary record fields require one shared target name');
  if(!policy.name.length||policy.name.length>100000)return fail('Expected a nonempty bounded Arrow field name');
  if(!selected||selected.index!==policy.parquetIndex)return fail('Explicit indexes do not identify the same structural field');
  if(mapEntries.has(selected.index))return fail('Renaming the synthetic MAP entry wrapper is unsupported');
  if(physical.containers!.some(c=>c.kind==='map'&&(c.keyIndex===selected.index||c.valueIndex===selected.index)))return fail('Native Arrow readers normalize MAP key/value role labels; rename descendants instead');
  // Preserve all original key/value wire entries. Only the designated Arrow value changes.
  const tree=copyJson(physical.wire!) as ParquetWireValue;if(tree.kind!=='struct')return fail('Expected footer struct');
  const kv=tree.fields.find(f=>f.id===5);if(!kv||kv.value.kind!=='list')return fail('File metadata list is unavailable');
  const entry=kv.value.items[embedded.metadataIndex!];if(entry?.kind!=='struct')return fail('Embedded schema entry is unavailable');
  const value=entry.fields.find(f=>f.id===2);if(!value)return fail('Embedded schema value is unavailable');
  field.name=policy.name;
  const encoded=encodeArrowFlatbuffer(importArrowFlatbufferModel(JSON.stringify(message),{id:source.id+'/renamed-arrow-message'}),backend);
  const originalPrefix=embedded.ipcHex!.startsWith('ffffffff')?8:4,padded=Math.ceil((originalPrefix+encoded.length)/8)*8-originalPrefix,bytes=new Uint8Array(originalPrefix+padded),view=new DataView(bytes.buffer);
  if(originalPrefix===8)view.setInt32(0,-1,true);view.setInt32(originalPrefix-4,padded,true);bytes.set(encoded,originalPrefix);
  let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  value.value={kind:'binary',hex:Array.from(new TextEncoder().encode(btoa(binary)),b=>b.toString(16).padStart(2,'0')).join('')};
  // Run the established physical rename without exposing either intermediate file.
  tree.fields=tree.fields.filter(f=>f.id!==5);
  const physicalName=policy.parquetName??policy.name,temporary=rewriteParquetFooter(source,tree).output,renamed=renameParquetField(temporary,policy.parquetIndex,physicalName);
  if(renamed.status!=='transformed'){result.diagnostics.push(...renamed.diagnostics);return fail('Physical rename rejected');}
  const finalTree=decodeParquetFooter(renamed.output!).value!;if(finalTree.kind!=='struct')return fail('Expected renamed footer struct');finalTree.fields.push(kv);
  const {output,unchangedPrefixBytes}=rewriteParquetFooter(renamed.output!,finalTree),after=getParquetArrowSchema(output);
  if(after.status!=='decoded'||exportArrowFlatbufferModel(after.message!)!==exportArrowFlatbufferModel(importArrowFlatbufferModel(JSON.stringify(message),{id:'compare'})))return fail('Rewritten embedded schema changed unexpected metadata');
  result.output=output;result.unchangedPrefixBytes=unchangedPrefixBytes;result.rename={from,to:[...from.slice(0,-1),policy.name],...(JSON.stringify(from)!==JSON.stringify(selected.path)||physicalName!==policy.name?{parquetFrom:[...selected.path],parquetTo:[...selected.path.slice(0,-1),physicalName]}:{})};result.status='transformed';
  result.diagnostics.push({code:'PARQUET_ARROW_NAME_REFERENCES_UNVERIFIED',path:'',severity:'warning',message:'Physical field and embedded Arrow field renamed together. All other metadata is preserved without rewriting name references; external consumers and schema/data correspondence remain unverified. Data-page prefix is unchanged.'});
  return copyJson(result) as unknown as ParquetArrowRenameResult;
 }catch(error){return fail(error instanceof Error?error.message:String(error));}
}
