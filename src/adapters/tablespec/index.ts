import manifest from '../../../spec/extensions/tablespec/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {parseNativeJson,parseNativeYaml,renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Element,type ExtensionPackage,type Json,type ScalarType} from '../../model/types';
export const TABLESPEC_EXTENSION='umf.tablespec';
export const tablespecPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'tablespec-table-1';root:NativeJson;originalSource:string;originalFormat:'json'|'yaml';splitFiles?:Record<string,string>};
const scalar:Record<string,ScalarType>={VARCHAR:'string',TEXT:'string',CHAR:'string',BOOLEAN:'boolean',INTEGER:'integer',DECIMAL:'decimal',FLOAT:'float',DATE:'date',DATETIME:'timestamp',TIMESTAMP:'timestamp'};
const parse=(text:string,format:'json'|'yaml')=>format==='json'?parseNativeJson(text):parseNativeYaml(text);
function columns(root:NativeJson):{name:string;elements:Element[];native:NativeJson[]} {
 if(root.kind!=='object'||root.members.table_name?.kind!=='string'||root.members.columns?.kind!=='array')throw new UmfError('TABLESPEC_TABLE','Expected table_name and a monolithic columns array');
 if(root.members.version?.kind!=='string'||root.members.version.value!=='1.0')throw new UmfError('TABLESPEC_VERSION','Expected TableSpec table version 1.0');
 const names=new Set<string>();
 const elements=root.members.columns.items.map((c,index):Element=>{
  if(c.kind!=='object'||c.members.name?.kind!=='string'||c.members.data_type?.kind!=='string')throw new UmfError('TABLESPEC_COLUMN','Expected native column name and data_type');
  const name=c.members.name.value;if(names.has(name))throw new UmfError('TABLESPEC_COLUMN','Duplicate column name');names.add(name);
  const scalarType=Object.hasOwn(scalar,c.members.data_type.value)?scalar[c.members.data_type.value]:undefined;
  return {id:'column:'+index,name,...(c.members.description?.kind==='string'?{description:c.members.description.value}:{}),...(scalarType?{scalarType}:{}),extensions:{}};
 });
 return {name:root.members.table_name.value,elements,native:root.members.columns.items};
}
export function importTableSpec(text:string,options:{id:string;format:'json'|'yaml'}):Document {
 if(!['json','yaml'].includes(options.format))throw new UmfError('TABLESPEC_FORMAT','Expected json or yaml');
 const root=parse(text,options.format),table=columns(root),payload:Payload={profile:'tablespec-table-1',root,originalSource:text,originalFormat:options.format};
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[TABLESPEC_EXTENSION]:{version:'0.1.0'}},extensions:{[TABLESPEC_EXTENSION]:payload as unknown as Json},modules:[{id:'table',namespace:table.name,elements:table.elements}]};
 if(!inspectTableSpec(doc).valid)throw new UmfError('TABLESPEC_DOCUMENT','Invalid UMF representation');return doc;
}
export function inspectTableSpec(document:Document){return validateDocument(document,new Registry().register(tablespecPackage));}
function payload(document:Document):Payload {
 if(!inspectTableSpec(document).valid||document.vocabularies[TABLESPEC_EXTENSION]?.version!=='0.1.0')throw new UmfError('TABLESPEC_DOCUMENT','Expected a valid pinned TableSpec document');
 const p=document.extensions?.[TABLESPEC_EXTENSION] as unknown as Payload;if(!p)throw new UmfError('TABLESPEC_PAYLOAD','Missing TableSpec source');return copyJson(p) as unknown as Payload;
}
function knownTree(node:NativeJson):void {
 const keys=node.kind==='object'?['kind','members']:node.kind==='array'?['kind','items']:node.kind==='null'?['kind']:['kind','value'];
 if(Object.keys(node).some(k=>!keys.includes(k)))throw new UmfError('TABLESPEC_ENCODING','Unknown tree encoding fields retained; export blocked');
 if(node.kind==='object')Object.values(node.members).forEach(knownTree);if(node.kind==='array')node.items.forEach(knownTree);
}
function checkedPayload(document:Document):Payload {
 const p=payload(document);if(Object.keys(p).some(k=>!['profile','root','originalSource','originalFormat','splitFiles'].includes(k)))throw new UmfError('TABLESPEC_ENCODING','Unknown source encoding fields retained; export blocked');knownTree(p.root);
 const table=columns(p.root),module=document.modules.find(m=>m.id==='table');
 if(!module||module.namespace!==table.name||module.elements.length!==table.elements.length||table.elements.some((e,i)=>{const actual=module.elements[i];return !actual||['id','name','description','scalarType'].some(k=>actual[k]!==e[k]);}))throw new UmfError('TABLESPEC_METADATA','Native source and core column metadata disagree; synchronize edits explicitly');
 return p;
}
export function exportTableSpec(document:Document):string {
 const p=checkedPayload(document);
 if(p.splitFiles)throw new UmfError('TABLESPEC_SPLIT','Use exportTableSpecBundle to preserve split-file semantics');
 return renderTree(parse(p.originalSource,p.originalFormat))===renderTree(p.root)?p.originalSource:renderTree(p.root)+'\n';
}
export function getTableSpecColumn(document:Document,index:number):NativeJson {
 const p=payload(document),c=columns(p.root).native;if(!Number.isSafeInteger(index)||index<0||index>=c.length)throw new UmfError('TABLESPEC_COLUMN','Column index does not exist');return copyJson(c[index]!) as unknown as NativeJson;
}
/** Copy the captured table view, including unknown native metadata and exact numbers.
 * Split sidecars and shadowed content remain in the document's source archive.
 * This is inspection, not native validation or a flattened split-file export.
 */
export function getTableSpecTable(document:Document):NativeJson {
 return payload(document).root;
}
/** Merge explicit native field changes on a copy, retaining unspecified fields. */
export function editTableSpecColumn(document:Document,index:number,changes:Record<string,NativeJson>):Document {
 const before=checkedPayload(document);
 if(before.splitFiles)exportTableSpecBundle(document);else exportTableSpec(document);
 const values=copyJson(changes) as Record<string,NativeJson>;
 if(!values||typeof values!=='object'||Array.isArray(values))throw new UmfError('TABLESPEC_COLUMN_EDIT','Expected a mapping of native column changes');
 const column=getTableSpecColumn(document,index);
 if(column.kind!=='object')throw new UmfError('TABLESPEC_COLUMN','Expected a column object');
 for(const [key,value] of Object.entries(values)){
  Object.defineProperty(column.members,key,{value,enumerable:true,writable:true,configurable:true});
 }
 const result=copyJson(document) as Document,p=result.extensions![TABLESPEC_EXTENSION] as unknown as Payload;
 if(p.root.kind!=='object'||p.root.members.columns?.kind!=='array')throw new UmfError('TABLESPEC_TABLE','Expected columns');
 p.root.members.columns.items[index]=column;
 const derived=columns(p.root).elements[index]!,element=result.modules.find(m=>m.id==='table')!.elements[index]!;
 delete element.description;delete element.scalarType;
 Object.assign(element,derived,{extensions:element.extensions});
 if(p.splitFiles)exportTableSpecBundle(result);else exportTableSpec(result);return result;
}

/** Merge explicit table metadata; column ordering/identity requires separate operations. */
export function editTableSpecTable(document:Document,changes:Record<string,NativeJson>):Document {
 const before=checkedPayload(document);if(before.splitFiles)exportTableSpecBundle(document);else exportTableSpec(document);
 const values=copyJson(changes) as Record<string,NativeJson>;
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.hasOwn(values,'columns'))throw new UmfError('TABLESPEC_TABLE_EDIT','Table metadata changes cannot replace columns');
 const result=copyJson(document) as Document,p=result.extensions![TABLESPEC_EXTENSION] as unknown as Payload;
 if(p.root.kind!=='object')throw new UmfError('TABLESPEC_TABLE','Expected a table object');
 for(const [key,value] of Object.entries(values))Object.defineProperty(p.root.members,key,{value,enumerable:true,writable:true,configurable:true});
 result.modules.find(m=>m.id==='table')!.namespace=columns(p.root).name;
 if(p.splitFiles)exportTableSpecBundle(result);else exportTableSpec(result);return result;
}

function splitView(files:Record<string,string>){
 for(const path of Object.keys(files))if(path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new UmfError('TABLESPEC_PATH','Expected normalized relative bundle paths');
 if(!Object.hasOwn(files,'table.yaml'))throw new UmfError('TABLESPEC_SPLIT','Missing table.yaml');
 const root=parseNativeYaml(files['table.yaml']!);
 if(root.kind!=='object')throw new UmfError('TABLESPEC_TABLE','Expected table mapping');
 // Python pathlib sorts Unicode code points; JavaScript sorts UTF-16 code units.
 const paths=Object.keys(files).filter(p=>/^columns\/[^/]+\.yaml(?![\s\S])/.test(p)).sort((a,b)=>{
  const x=Array.from(a,c=>c.codePointAt(0)!),y=Array.from(b,c=>c.codePointAt(0)!);
  for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]!-y[i]!;return x.length-y.length;
 });
 const entries=paths.map(path=>{
  const source=parseNativeYaml(files[path]!);
  if(source.kind!=='object'||source.members.column?.kind!=='object')throw new UmfError('TABLESPEC_COLUMN','Expected column mapping in '+path);
  const column=copyJson(source.members.column) as Extract<NativeJson,{kind:'object'}>;
  if(Object.hasOwn(source.members,'derivation'))column.members.derivation=copyJson(source.members.derivation!) as NativeJson;
  return {path,source,column};
 });
 if(!entries.length)throw new UmfError('TABLESPEC_SPLIT','Expected at least one columns/*.yaml file');
 root.members.columns={kind:'array',items:entries.map(e=>e.column)};
 return {root,entries};
}
/** Captures all files; the metadata view does not execute loader migrations. */
export function importTableSpecBundle(files:Record<string,string>,options:{id:string}):Document {
 const copied=copyJson(files) as Record<string,string>,{root}=splitView(copied);
 const document=importTableSpec(renderTree(root),{id:options.id,format:'json'});
 (document.extensions![TABLESPEC_EXTENSION] as unknown as Payload).splitFiles=copied;
 if(!inspectTableSpec(document).valid)throw new UmfError('TABLESPEC_SPLIT','Invalid split bundle');
 return document;
}
export function exportTableSpecBundle(document:Document):Record<string,string> {
 const p=checkedPayload(document);if(!p.splitFiles)throw new UmfError('TABLESPEC_SPLIT','Expected a split bundle');
 const files=copyJson(p.splitFiles) as Record<string,string>,{entries}=splitView(files),current=columns(p.root).native;
 if(current.length!==entries.length)throw new UmfError('TABLESPEC_SPLIT','Column insertion/deletion needs explicit file mapping');
 if(p.root.kind!=='object')throw new UmfError('TABLESPEC_TABLE','Expected a table object');
 const table=parseNativeYaml(files['table.yaml']!);if(table.kind!=='object')throw new UmfError('TABLESPEC_TABLE','Expected table.yaml mapping');
 const originalTable=renderTree(table);
 // columns in table.yaml are shadowed by column files; preserve any original copy.
 for(const key of Object.keys(table.members))if(key!=='columns'&&!Object.hasOwn(p.root.members,key))delete table.members[key];
 for(const [key,value] of Object.entries(p.root.members))if(key!=='columns')Object.defineProperty(table.members,key,{value:copyJson(value),enumerable:true,writable:true,configurable:true});
 if(renderTree(table)!==originalTable)files['table.yaml']=renderTree(table)+'\n';
 entries.forEach((entry,index)=>{
  if(renderTree(entry.column)===renderTree(current[index]!))return;
  const replacement=copyJson(current[index]!) as Extract<NativeJson,{kind:'object'}>;
  if(Object.hasOwn(entry.source.members,'derivation')){
   if(!Object.hasOwn(replacement.members,'derivation'))throw new UmfError('TABLESPEC_SPLIT','Removing sibling derivation requires explicit file edit');
   entry.source.members.derivation=replacement.members.derivation!;
   // Native sibling derivation takes precedence over an inline one; retain both.
   const original=entry.source.members.column as Extract<NativeJson,{kind:'object'}>;
   if(Object.hasOwn(original.members,'derivation'))replacement.members.derivation=original.members.derivation!;else delete replacement.members.derivation;
  }
  entry.source.members.column=replacement;files[entry.path]=renderTree(entry.source)+'\n';
 });
 return files;
}
