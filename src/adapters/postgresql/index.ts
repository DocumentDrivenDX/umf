import nativeAstSchema from '../../../spec/extensions/postgresql/native-ast.schema.json';
import {createValidator} from '../../validation/schema';
import manifest from '../../../spec/extensions/postgresql/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson,LIMITS} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const POSTGRESQL_EXTENSION='umf.postgresql';
export const postgresqlPackage=manifest as unknown as ExtensionPackage;
export interface PostgresqlBackend {identity:'@libpg-query/parser@17.6.10';parse(sql:string):Promise<unknown>;deparse(tree:unknown):Promise<string>;codecRoundTrip(tree:unknown):unknown;}
let nativeCheck:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
/** Validate the known native JSON vocabulary without removing unknown fields. */
export function validatePostgresqlAst(tree:unknown){
 const value=copyJson(tree);nativeCheck??=createValidator(false).compile(nativeAstSchema);
 const valid=nativeCheck(value);return {valid,complete:false,errors:copyJson(nativeCheck.errors??[])};
}
type Payload={profile:'postgresql-raw-parse-tree';source:string;root:NativeJson};
function canonical(value:unknown,omitOffsets=false):string{
 if(Array.isArray(value))return '['+value.map(x=>canonical(x,omitOffsets)).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>!omitOffsets||!['location','stmt_location','stmt_len'].includes(k)).sort().map(k=>JSON.stringify(k)+':'+canonical((value as any)[k],omitOffsets)).join(',')+'}';
 return JSON.stringify(value);
}
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload;const diagnostics:Diagnostic[]=[{code:'POSTGRESQL_CATALOG_UNRESOLVED',path:'',severity:'warning',message:'Raw syntax is not catalog resolution, SQL execution, permissions or server-state validation'}];
 if(Object.keys(p).some(k=>!['profile','source','root'].includes(k)))diagnostics.push({code:'POSTGRESQL_REPRESENTATION',path:'',severity:'warning',message:'Unknown representation content must remain in UMF and blocks SQL export'});
 if(p.root.kind!=='object'||p.root.members.version?.kind!=='number'||p.root.members.version.value!=='170004')diagnostics.push({code:'POSTGRESQL_VERSION',path:'/root',severity:'warning',message:'Uninterpreted parser tree version retained; native SQL export is unavailable'});
 function tagged(n:NativeJson){const keys=n.kind==='null'?['kind']:n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))diagnostics.push({code:'POSTGRESQL_REPRESENTATION',path:'/root',severity:'warning',message:'Unknown tagged-tree content blocks SQL export'});if(n.kind==='object')Object.values(n.members).forEach(tagged);if(n.kind==='array')n.items.forEach(tagged);}
 tagged(p.root);return diagnostics;
}
export function postgresqlRegistry(){return new Registry().register(postgresqlPackage,inspect);}
export function inspectPostgresql(document:Document){return validateDocument(document,postgresqlRegistry());}
function payload(document:Document):Payload{
 const validation=inspectPostgresql(document);if(!validation.valid)throw new UmfError('POSTGRESQL_DOCUMENT',JSON.stringify(validation.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[POSTGRESQL_EXTENSION];
 if(!value||document.vocabularies[POSTGRESQL_EXTENSION]?.version!=='0.1.0')throw new UmfError('POSTGRESQL_PAYLOAD','Expected the PostgreSQL extension');
 return copyJson(value) as unknown as Payload;
}
function checkBackend(backend:PostgresqlBackend){if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function'||typeof backend.deparse!=='function'||typeof backend.codecRoundTrip!=='function')throw new UmfError('POSTGRESQL_BACKEND','Expected the explicitly supplied pinned parser/deparser backend');}
export async function importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<Document>{
 checkBackend(backend);if(typeof source!=='string'||source.length>LIMITS.maxTextLength||source.includes('\0'))throw new UmfError('POSTGRESQL_SOURCE','Expected bounded SQL without NUL bytes');
 const tree=copyJson(await backend.parse(source));
 const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[POSTGRESQL_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[POSTGRESQL_EXTENSION]:{profile:'postgresql-raw-parse-tree',source,root:parseNativeJson(JSON.stringify(tree))} as unknown as Json}}]}]};payload(document);return document;
}
/** Original source archive; it deliberately remains the pre-edit source. */
export function getPostgresqlSource(document:Document){return payload(document).source;}
export function getPostgresqlNode(document:Document,path:string){let node=payload(document).root;for(const key of nativePointer(path))node=treeChild(node,key);return copyJson(node) as unknown as NativeJson;}
export function proposePostgresqlNodeEdit(document:Document,path:string,text:string){
 const p=payload(document);
 if(inspectPostgresql(document).diagnostics.some(d=>d.code==='POSTGRESQL_REPRESENTATION'))throw new UmfError('POSTGRESQL_REPRESENTATION','Unknown representation content prevents native node replacement');
 const replacement=parseNativeJson(text);const parts=nativePointer(path);
 if(!parts.length)p.root=replacement;else{let parent=p.root;for(const key of parts.slice(0,-1))parent=treeChild(parent,key);const key=parts.at(-1)!;treeChild(parent,key);if(parent.kind==='object')parent.members[key]=replacement;else if(parent.kind==='array')parent.items[Number(key)]=replacement;else throw new UmfError('POSTGRESQL_EDIT','Expected existing node');}
 const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[POSTGRESQL_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectPostgresql(next)};
}
/** Regenerate SQL from the current AST, preserving the source archive separately. No SQL is executed. */
export async function exportPostgresqlSql(document:Document,backend:PostgresqlBackend):Promise<string>{
 checkBackend(backend);const p=payload(document);if(inspectPostgresql(document).diagnostics.some(d=>['POSTGRESQL_REPRESENTATION','POSTGRESQL_VERSION'].includes(d.code)))throw new UmfError('POSTGRESQL_EXPORT','Unknown representation/version cannot be discarded during export');
 const tree=copyJson(JSON.parse(renderTree(p.root)));
 // Ensure host conversion did not round an exact AST numeric value.
 if(canonical(parseNativeJson(JSON.stringify(tree)))!==canonical(p.root))throw new UmfError('POSTGRESQL_NUMERIC','AST numbers cannot be represented exactly by the native wrapper');
 const encoded=copyJson(backend.codecRoundTrip(copyJson(tree)));
 if(canonical(encoded)!==canonical(tree))throw new UmfError('POSTGRESQL_CODEC_LOSS','Native Protobuf conversion would drop or change AST content');
 if(!validatePostgresqlAst(tree).valid)throw new UmfError('POSTGRESQL_AST','Known native AST fields violate the pinned typed schema');
 const sql=await backend.deparse(copyJson(tree));if(typeof sql!=='string'||sql.length>LIMITS.maxTextLength)throw new UmfError('POSTGRESQL_DEPARSE','Invalid native SQL output');
 const reparsed=copyJson(await backend.parse(sql));
 if(canonical(reparsed,true)!==canonical(tree,true))throw new UmfError('POSTGRESQL_ROUND_TRIP','Native deparse/reparse changed AST content beyond source offsets');
 return sql;
}
