import schema from '../../../spec/extensions/postgresql-catalog/key-observations-v1.schema.json';
import {createValidator} from '../../validation/schema';
import {catalogIntegerErrors} from '../../validation/catalog-integers';
import {parseNativeJson,renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Json} from '../../model/types';
export {default as postgresqlKeyObservationsSchema} from '../../../spec/extensions/postgresql-catalog/key-observations-v1.schema.json';
const check=createValidator().compile(schema);
/** Only the typed convenience view omits unknown properties; source and tree retain them. */
function known(node:NativeJson,rule:any):Json {
 if(rule.anyOf)return known(node,rule.anyOf.find((s:any)=>node.kind==='null'?s.type==='null':s.type!=='null'));
 if(node.kind==='object'){const out:Record<string,Json>=Object.create(null);for(const [key,s] of Object.entries(rule.properties??{}))if(node.members[key]!==undefined)out[key]=known(node.members[key]!,s);return out;}
 if(node.kind==='array')return node.items.map(n=>known(n,rule.items));
 if(node.kind==='null')return null;return node.kind==='number'?Number(node.value):node.value;
}
export interface PostgresqlKeyCollation {schema:string;name:string;provider:string;deterministic:boolean;locale:string|null;version:string|null}
export interface PostgresqlKeyComponent {position:number;attribute:number;name:string|null;notNull:boolean|null;type:string|null;typeSchema:string|null;typeName:string|null;typeKind:string|null;operatorClass:string|null;collation:PostgresqlKeyCollation|null}
export interface PostgresqlKeyIndex {
 schema:string;table:string;relationKind:string;index:string;accessMethod:string;
 unique:boolean;primary:boolean;valid:boolean;ready:boolean;live:boolean;immediate:boolean;nullsNotDistinct:boolean;
 keyCount:number;attributeCount:number;predicate:string|null;expressions:string|null;definition:string;
 constraint:{name:string;kind:'p'|'u';validated:boolean;deferrable:boolean;deferred:boolean;definition:string}|null;
 parents:string[];children:string[];components:PostgresqlKeyComponent[];
}
function fail(message:string):never{throw new UmfError('POSTGRESQL_KEY_CATALOG',message);}
/** Validate observations without inferring authored keys, equivalent equality or trusted provenance. */
export function inspectPostgresqlKeyCatalog(text:string){
 const root=parseNativeJson(text);
 if(catalogIntegerErrors(root,schema).length)fail('Declared catalog integers must be exact interoperable values');
 if(!check(JSON.parse(renderTree(root))))fail(JSON.stringify(check.errors));
 const view=known(root,schema) as unknown as {profile:string;serverVersion:170004;encoding:'UTF8';query:string;indexes:PostgresqlKeyIndex[]};
 const identities=new Set<string>();
 for(const index of view.indexes){
  const identity=JSON.stringify([index.schema,index.index]);if(identities.has(identity))fail('Duplicate schema/index identity');identities.add(identity);
  if(index.keyCount>index.attributeCount||index.components.length!==index.attributeCount)fail('Component counts disagree');
  for(const [i,c] of index.components.entries()){
   if(c.position!==i+1)fail('Component positions must be complete and ordered');
   if(c.attribute>0){if(c.name===null||c.type===null||c.typeName===null||c.typeSchema===null||c.typeKind===null||c.notNull===null)fail('Column components need resolved column observations');}
   else if(c.name!==null||c.notNull!==null||c.type!==null||c.typeName!==null||c.typeSchema!==null||c.typeKind!==null)fail('Expression components cannot masquerade as resolved columns');
  }
  if(index.components.some(c=>c.attribute===0)!==(index.expressions!==null))fail('Expression metadata and component identities disagree');
  // Repeated index expressions/columns remain native details, never a distinct ideal key.
  if(index.primary&&!index.unique)fail('Primary index must be unique');
  if(index.constraint){if(!index.unique||index.primary!==(index.constraint.kind==='p'))fail('Constraint/index kind disagreement');if(index.constraint.deferred&&!index.constraint.deferrable)fail('Initially deferred constraint must be deferrable');}
 }
 return {root,nativeSource:text,serverVersion:view.serverVersion,encoding:view.encoding,query:view.query,indexes:view.indexes,provenance:'unverified' as const};
}
