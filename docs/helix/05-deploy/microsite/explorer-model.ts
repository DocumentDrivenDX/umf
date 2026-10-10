import {displayLabel} from './presentation';
import {readJsonValue} from '../../../../src/model/serialization';
import {generateArtifactCollectionSchema} from '../../../../src/domain-packs/artifacts';
import {createValidator} from '../../../../src/validation/schema';
import {inspectDomainPack} from '../../../../src/domain-packs/profile';
import {parseNativeJson,parseNativeYaml,renderTree,type NativeJson} from '../../../../src/model/native-json';
import {importTableSpec,inspectTableSpec} from '../../../../src/adapters/tablespec';
import {readDocument} from '../../../../src/model/document';
import {validateDocument} from '../../../../src/validation/document';
import type {Document} from '../../../../src/model/types';
export type {SourceArtifact,Entry} from '../schema-browser/types';
import type {Entry} from '../schema-browser/types';
export interface Definition {key:string;module:string;id:string;title:string;value:Record<string,unknown>;pointer:string}
export interface Parsed {document?:Document;native?:Record<string,any>;label?:string;definitions:Definition[];diagnostics:string;valid:boolean;complete:boolean}
export const key=(module:string,id:string)=>JSON.stringify([module,id]);
export function parseEntry(entry:Entry):Parsed {
 const tree=entry.format==='json'?parseNativeJson(entry.text):parseNativeYaml(entry.text);
 const native=nativeView(tree);
 if(!native||typeof native!=='object'||Array.isArray(native))throw new Error('Expected a schema or pack object.');
 if(entry.schemaFormat==='artifact-collection'){const validate=createValidator().compile(generateArtifactCollectionSchema());if(!validate(readJsonValue(renderTree(tree),'json')))throw Error('Artifact collection metadata refused: '+JSON.stringify(validate.errors));return {native,label:'Artifact collection 1.0.0',definitions:[],valid:true,complete:false,diagnostics:'Declared artifact metadata only. Collection inspection retrieves no originals and certifies no native interpretation.'};}
 if(typeof native.umf!=='string'){
  if(native.table_name&&Array.isArray(native.columns)){
   const document=importTableSpec(entry.text,{id:entry.id,format:entry.format}),checked=inspectTableSpec(document);
   return {native,label:`TableSpec ${native.version??'version not declared'}`,definitions:native.columns.map((c:any,i:number)=>({key:key('native',c.name),module:native.table_name,id:c.name,title:c.name,value:c,pointer:`/columns/${i}`})),valid:checked.valid,complete:false,diagnostics:checked.diagnostics.map(d=>`${d.code}: ${d.message}`).join('\n')};
  }
  if(native.domain_types&&typeof native.id==='string'){const checked=inspectDomainPack(readJsonValue(renderTree(tree),'json'));return {native,label:`Domain pack ${native.version??'version not declared'}`,definitions:Object.entries(native.domain_types).map(([id,value])=>({key:key('native',id),module:native.id,id,title:id,value:value as Record<string,unknown>,pointer:'/domain_types/'+id.replace(/~/g,'~0').replace(/\//g,'~1')})),valid:checked.valid,complete:checked.complete,diagnostics:checked.diagnostics.join('\n')||'Canonical metadata and declared execution profile validated. Generators, source data and graph storage never execute in this explorer.'};}
  if(native.$schema||native.$defs||native.definitions||entry.schemaFormat==='json-schema')return {native,label:'JSON Schema · source inspection',definitions:[],valid:false,complete:false,diagnostics:'Schema keywords are displayed as declared. Instance validation and reference evaluation are not performed.'};
  throw new Error('Unsupported schema shape. Supply a UMF document, domain-pack manifest, TableSpec table, or JSON Schema.');
 }
 const document=readDocument(entry.text,entry.format);
 const checked=validateDocument(document);
 const definitions=document.modules.flatMap((m,mi)=>m.elements.map((e,ei)=>({key:key(m.id,e.id),module:m.id,id:e.id,title:String(e.title??e.name??e.id),value:e,pointer:`/modules/${mi}/elements/${ei}`})));
 return {document,definitions,valid:checked.valid,complete:checked.complete,diagnostics:checked.diagnostics.map(d=>`${d.severity.toUpperCase()} ${d.code} ${d.path}: ${d.message}`).join('\n')};
}
export function matches(entry:Entry,query:string):boolean {return `${entry.title}\n${displayLabel(entry.title)}\n${entry.path}\n${entry.pack??''}\n${displayLabel(entry.pack??'')}\n${entry.text}`.toLowerCase().includes(query.toLowerCase());}

/** Numeric lexemes remain explicit tokens in the metadata view; source text stays exact. */
function nativeView(tree:NativeJson):any {switch(tree.kind){case 'number':return {numberToken:tree.value};case 'string':case 'boolean':return tree.value;case 'null':return null;case 'array':return tree.items.map(nativeView);case 'object':return Object.fromEntries(Object.entries(tree.members).map(([k,v])=>[k,nativeView(v)]));}}
