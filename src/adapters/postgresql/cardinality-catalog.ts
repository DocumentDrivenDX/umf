import schema from '../../../spec/extensions/postgresql-catalog/cardinality-v1.schema.json';
import {createValidator} from '../../validation/schema';
import {catalogIntegerErrors} from '../../validation/catalog-integers';
import {parseNativeJson,renderTree,type NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/types';
export interface PostgresqlTypeIdentity {schema:string;name:string;}
interface ObservedType {identity:PostgresqlTypeIdentity;kind:string;category:string;element:PostgresqlTypeIdentity|null;base:PostgresqlTypeIdentity|null;standardArray:boolean;}
interface ObservedColumn {schema:string;relation:string;name:string;ordinal:number;declaredDimensions:number;type:PostgresqlTypeIdentity;}
interface Supplement {profile:string;version:string;serverVersion:number;columns:ObservedColumn[];types:ObservedType[];}
const check=createValidator().compile<Supplement>(schema);
const key=(identity:PostgresqlTypeIdentity)=>JSON.stringify([identity.schema,identity.name]);
function fail(message:string):never{throw new UmfError('POSTGRESQL_CARDINALITY_CATALOG',message);}
/** Validate the bounded supplement without interpreting unknown native content.
 * The original text and exact-token tree remain authoritative, not the host view.
 * This does not establish correspondence with a separately captured catalog.
 */
export function inspectPostgresqlCardinalityCatalog(text:string){
 const root=parseNativeJson(text);
 if(catalogIntegerErrors(root,schema).length)fail('Catalog integers must be exact interoperable integers');
 const view:unknown=JSON.parse(renderTree(root));
 if(!check(view))fail(JSON.stringify(check.errors));
 const types=new Map<string,ObservedType>();
 for(const type of view.types){const id=key(type.identity);if(types.has(id))fail('Duplicate qualified type identity');types.set(id,type);}
 for(const type of view.types){
  for(const edge of [type.element,type.base])if(edge&&!types.has(key(edge)))fail('Missing referenced type');
  if(type.standardArray&&(type.element===null||type.kind!=='b'||type.category!=='A'||type.base!==null))fail('Inconsistent standard-array observation');
  if(type.kind==='d'&&type.base===null)fail('Domain without base observation');
  if(type.kind!=='d'&&type.base!==null)fail('Non-domain with base observation');
 }
 const names=new Set<string>(),ordinals=new Set<string>();
 for(const column of view.columns){
  const name=JSON.stringify([column.schema,column.relation,column.name]),ordinal=JSON.stringify([column.schema,column.relation,column.ordinal]);
  if(names.has(name)||ordinals.has(ordinal))fail('Duplicate column name or ordinal');names.add(name);ordinals.add(ordinal);
  if(!types.has(key(column.type)))fail('Missing column type');
 }
 // Reject impossible domain cycles. Array/composite recursion is not expanded.
 for(const type of view.types){const seen=new Set<string>();let current=type;
  while(current.base){const id=key(current.identity);if(seen.has(id))fail('Cyclic domain base observations');seen.add(id);current=types.get(key(current.base))!;}
 }
 // Return only interpreted fields in the convenience view. Unknown fields,
 // including out-of-range numeric tokens, remain exclusively in root/source.
 const identity=(v:PostgresqlTypeIdentity):PostgresqlTypeIdentity=>({schema:v.schema,name:v.name});
 const columns=view.columns.map(c=>({schema:c.schema,relation:c.relation,name:c.name,ordinal:c.ordinal,declaredDimensions:c.declaredDimensions,type:identity(c.type)}));
 const observations=view.types.map(t=>({identity:identity(t.identity),kind:t.kind,category:t.category,element:t.element?identity(t.element):null,base:t.base?identity(t.base):null,standardArray:t.standardArray}));
 return {nativeSource:text,root,serverVersion:view.serverVersion,qualifiedVersion:view.serverVersion===170004,columns,types:observations};
}
/** Resolve domain bases only. Category A and formatted names never imply arrays.
 * The result describes native relationships, not ideal admission or enforcement.
 */
export function resolvePostgresqlCardinalityType(text:string,column:{schema:string;relation:string;name:string}){
 const catalog=inspectPostgresqlCardinalityCatalog(text);
 const observed=catalog.columns.find(c=>c.schema===column.schema&&c.relation===column.relation&&c.name===column.name);
 if(!observed)fail('Column not captured');
 const types=new Map(catalog.types.map(t=>[key(t.identity),t]));
 const domains:ObservedType[]=[];let native=types.get(key(observed.type))!;
 while(native.base){domains.push(native);native=types.get(key(native.base))!;}
 return {nativeSource:text,root:catalog.root as NativeJson,qualifiedVersion:catalog.qualifiedVersion,column:observed,domains,native,element:native.element?types.get(key(native.element))!:null,standardArray:native.standardArray};
}
