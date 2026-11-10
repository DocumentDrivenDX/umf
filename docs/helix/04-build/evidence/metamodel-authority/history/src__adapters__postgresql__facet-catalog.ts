import schema from '../../../spec/extensions/postgresql-catalog/facet-constraints-v1.schema.json';
import {createValidator} from '../../validation/schema';
import {catalogIntegerErrors} from '../../validation/catalog-integers';
import {parseNativeJson,renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Json} from '../../model/types';
import {exportPostgresqlCatalogCapture,getPostgresqlCatalogNode} from './catalog';
import type {PostgresqlBackend} from './index';
import {inspectPostgresqlFacetPredicate} from './facet-predicate';
import {inspectResolvedFacetPredicate} from './facet-resolved-predicate';
const check=createValidator().compile(schema);
type Obj=Record<string,Json>;
const object=(v:Json|undefined):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function fail(message:string):never{throw new UmfError('POSTGRESQL_FACET_CATALOG',message);}
/** Strip unknown fields only from the interpreted convenience view. They remain
 * exact in root/nativeSource and must accompany any derived observation. */
function known(node:NativeJson,rule:any):Json{
 if(rule.$ref)return known(node,(schema.$defs as any)[rule.$ref.slice('#/$defs/'.length)]);
 if(rule.anyOf)return known(node,rule.anyOf.find((r:any)=>node.kind==='null'?r.type==='null':r.type!=='null'));
 if(node.kind==='object'){const out:Obj=Object.create(null);for(const [key,r] of Object.entries(rule.properties??{}))if(node.members[key]!==undefined)out[key]=known(node.members[key]!,r);return out;}
 if(node.kind==='array')return node.items.map(n=>known(n,rule.items));
 if(node.kind==='null')return null;
 return node.kind==='number'?Number(node.value):node.value;
}
export function inspectPostgresqlFacetCatalog(text:string){
 const root=parseNativeJson(text);if(catalogIntegerErrors(root,schema).length)fail('Catalog integers must be exact interoperable values');
 const validationView:unknown=JSON.parse(renderTree(root));if(!check(validationView))fail(JSON.stringify(check.errors));
 const view=known(root,schema);
 const data=view as Obj,constraints=data.constraints as Obj[],identities=new Set<string>(),oids=new Set<string>();
 for(const c of constraints){
  const identity=JSON.stringify([c.schema,c.relation,c.name]);if(identities.has(identity)||oids.has(c.oid as string))fail('Duplicate constraint identity');identities.add(identity);oids.add(c.oid as string);
  const numbers=new Set<number>(),names=new Set<string>();
  for(const column of (c.columns??[]) as Obj[]){if(numbers.has(column.number as number)||names.has(column.name as string))fail('Duplicate column observation');numbers.add(column.number as number);names.add(column.name as string);}
  const refs=(c.columnNumbers??[]) as number[];if(new Set(refs).size!==refs.length||refs.some(n=>!numbers.has(n)))fail('Invalid referenced column observations');
 }
 return {root,nativeSource:text,serverVersion:data.serverVersion as number,encoding:data.encoding as string,constraints};
}
const str=(v:NativeJson|undefined)=>v?.kind==='string'?v.value:undefined;
const num=(v:NativeJson|undefined)=>v?.kind==='number'?Number(v.value):undefined;
const bool=(v:NativeJson|undefined)=>v?.kind==='boolean'?v.value:undefined;
/** Verify overlapping observations, including complete table-CHECK coverage.
 * This is a consistency check, not authentication or same-snapshot provenance.
 * All original source text, unknown properties and exact numbers are retained. */
export async function correlatePostgresqlFacetCatalog(document:Document,text:string,datumFormat:string,backend:PostgresqlBackend){
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')fail('Pinned PostgreSQL parser backend required');
 const supplement=inspectPostgresqlFacetCatalog(text),exported=exportPostgresqlCatalogCapture(document);
 if(exported.state!=='captured')fail('Modified catalog cannot establish capture correspondence');
 if(num(getPostgresqlCatalogNode(document,'/serverVersion'))!==supplement.serverVersion)fail('Server versions disagree');
 const relations=getPostgresqlCatalogNode(document,'/snapshot/relations');if(relations.kind!=='array'&&relations.kind!=='null')fail('Expected catalog relations');
 const matches:{identity:{schema:string;relation:string;constraint:string};columns:{name:string;path:string}[];inspection:ReturnType<typeof inspectResolvedFacetPredicate>}[]=[];
 const seenRelations=new Set<string>(),seenChecks=new Set<string>();
 for(const [ri,r] of (relations.kind==='array'?relations.items:[]).entries()){
  if(r.kind!=='object')fail('Expected native relation');const m=r.members,s=str(m.schema),name=str(m.name),rel=JSON.stringify([s,name]);
  if(s===undefined||name===undefined||seenRelations.has(rel))fail('Ambiguous relation identity');seenRelations.add(rel);
  const checks=m.constraints?.kind==='array'?m.constraints.items:[];
  const columns=m.columns?.kind==='array'?m.columns.items:[];
  for(const item of checks){
   if(item.kind!=='object'||str(item.members.kind)!=='c')continue;const native=item.members,constraint=str(native.name);if(constraint===undefined)fail('Unnamed CHECK');
   const key=JSON.stringify([s,name,constraint]);if(seenChecks.has(key))fail('Duplicate CHECK');seenChecks.add(key);
   const c=supplement.constraints.find(c=>c.schema===s&&c.relation===name&&c.name===constraint);if(!c)fail('CHECK absent from supplement');
   if(c.relationKind!==str(m.kind)||c.definition!==str(native.definition)||c.validated!==bool(native.validated)||bool(native.deferrable)!==false||bool(native.deferred)!==false)fail('Constraint observations disagree');
   const observed=(c.columns??[]) as Obj[];if(observed.length!==columns.length)fail('Relation column coverage differs');
   const columnNames=new Set<string>(),columnNumbers=new Set<number>();
   const paths=columns.map((column,ci)=>{
    if(column.kind!=='object')fail('Expected native column');const fields=column.members,n=str(fields.name),position=num(fields.position),t=fields.nativeType;
    if(n===undefined||position===undefined||columnNames.has(n)||columnNumbers.has(position)||t?.kind!=='object')fail('Ambiguous or incomplete column observation');columnNames.add(n);columnNumbers.add(position);
    const other=observed.find(c=>c.name===n&&c.number===position);if(!other)fail('Column missing from supplement');
    if(other.typeSchema!==str(t.members.schema)||other.typeName!==str(t.members.name)||other.typeKind!==str(t.members.kind)||other.modifier!==num(t.members.modifier)||other.dimensions!==num(t.members.dimensions))fail('Native column type observations disagree');
    return {name:n,path:`/snapshot/relations/${ri}/columns/${ci}`,number:position};
   });
   const inspection=inspectResolvedFacetPredicate(c,{serverVersion:supplement.serverVersion,encoding:supplement.encoding,datumFormat});
   if(inspection.state==='verified-expression'){
    const expectedDefinition='CHECK ('+c.expression+')'+(c.noInherit?' NO INHERIT':'')+(c.validated?'':' NOT VALID');
    if(c.definition!==expectedDefinition)fail('CHECK definition and expression disagree');
    const column=observed.find(col=>Array.isArray(c.columnNumbers)&&c.columnNumbers.includes(col.number!));
    const syntax=inspectPostgresqlFacetPredicate(await backend.parse('SELECT '+c.expression),column!.name as string);
    if(syntax.state!=='candidate')fail('Analyzed tree does not have corresponding supported SQL syntax');
    const decimal=(s:string)=>{let v=s.replace(/(\.[0-9]*?)0+$/,'$1').replace(/\.$/,'');if(v==='-0')v='0';return v;};
    const terms=syntax.candidates.map(t=>t.kind==='bound'?{kind:'bound',operator:t.operator,literal:decimal(t.literal)}:t.kind==='length'?{kind:'length',unit:t.functionName.at(-1)==='char_length'?'unicode-scalar':'byte',max:t.max}:{kind:'scale',scale:t.scale});
    if(JSON.stringify(terms)!==JSON.stringify(inspection.terms))fail('Analyzed predicate and SQL expression values disagree');
   }
   matches.push({identity:{schema:s,relation:name,constraint},columns:paths.filter(p=>Array.isArray(c.columnNumbers)&&c.columnNumbers.includes(p.number)).map(({name,path})=>({name,path})),inspection});
  }
 }
 if(matches.length!==supplement.constraints.length)fail('Supplement has CHECKs absent from catalog');
 return {nativeSupplement:supplement.nativeSource,root:supplement.root,nativeCatalog:exported.json,matches,sameSnapshotVerified:false as const,authenticated:false as const};
}
