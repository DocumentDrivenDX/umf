import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {renderTree} from '../../model/native-json';
import {exportPostgresqlCatalogCapture,getPostgresqlCatalogNode} from './catalog';
import {inspectPostgresqlKeyCatalog} from './key-catalog';
import type {PostgresqlBackend} from './index';
import {createValidator} from '../../validation/schema';
import nativeSchema from '../../../spec/core/native-json.schema.json';
import resultSchema from '../../../spec/core/postgresql-key-catalog-correlation.schema.json';
export {default as postgresqlKeyCatalogCorrelationSchema} from '../../../spec/core/postgresql-key-catalog-correlation.schema.json';
const validator=createValidator();validator.addSchema(nativeSchema);const checkResult=validator.compile(resultSchema);
const fail=(message:string):never=>{throw new UmfError('POSTGRESQL_KEY_CORRELATION',message);};
function canonical(v:any):string {if(Array.isArray(v))return 'a['+v.map(canonical).join(',')+']';if(v!==null&&typeof v==='object')return 'o{'+Object.keys(v).filter(k=>!['location','stmt_location','stmt_len'].includes(k)).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
/** Correlate complete overlapping native observations. This does not authenticate
 * either source, prove a shared transaction snapshot, or establish ideal equality. */
export async function correlatePostgresqlKeyCatalog(document:Document,text:string,backend:PostgresqlBackend){
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')fail('Pinned PostgreSQL parser backend required');
 const supplement=inspectPostgresqlKeyCatalog(text),native=exportPostgresqlCatalogCapture(document);
 if(native.state!=='captured')fail('Modified catalog cannot establish observation correspondence');
 const version=getPostgresqlCatalogNode(document,'/serverVersion');if(version.kind!=='number'||version.value!==String(supplement.serverVersion))fail('Server versions disagree');
 const node=getPostgresqlCatalogNode(document,'/snapshot/relations');if(node.kind!=='array'&&node.kind!=='null')fail('Expected native relation inventory');
 // This convenience view is used only for declared, already validated catalog fields.
 // The authoritative tagged tree and exported native text remain unchanged.
 const relations:any[]=node.kind==='null'?[]:JSON.parse(renderTree(node));
 const collationNode=getPostgresqlCatalogNode(document,'/snapshot/collations'),collations:any[]=collationNode.kind==='null'?[]:JSON.parse(renderTree(collationNode));
 if(!Array.isArray(collations))fail('Expected collation inventory');
 const relationIds=new Set<string>();for(const r of relations){const id=JSON.stringify([r.schema,r.name]);if(relationIds.has(id))fail('Duplicate relation identity');relationIds.add(id);}
 const statement=async(sql:string)=>{const ast=copyJson(await backend.parse(sql)) as any;if(ast.version!==170004||ast.stmts?.length!==1)fail('Expected one pinned PostgreSQL statement');return ast.stmts[0].stmt;};
 const expression=async(sql:string)=>{const stmt=await statement('SELECT '+sql);if(!stmt.SelectStmt?.targetList)fail('Expected expression list');return stmt.SelectStmt.targetList.map((t:any)=>t.ResTarget?.val);};
 const children=new Map<string,string[]>();
 for(const child of relations)for(const parent of child.parents??[]){
  const stmt=await statement('TABLE '+parent),items=stmt.SelectStmt?.fromClause;
  if(!Array.isArray(items)||items.length!==1||!items[0].RangeVar)fail('Invalid inherited parent reference');
  const ref=items[0].RangeVar,candidates=relations.filter(r=>r.name===ref.relname&&(ref.schemaname===undefined||r.schema===ref.schemaname));
  if(candidates.length!==1)fail('Inherited parent is unresolved or ambiguous');
  const parentId=JSON.stringify([candidates[0].schema,candidates[0].name]),childId=JSON.stringify([child.schema,child.name]);children.set(parentId,[...(children.get(parentId)??[]),childId]);
 }
 const matches:{identity:{schema:string;table:string;index:string};relationPath:string;indexPath:string;componentPaths:(string|null)[]}[]=[];
 for(const [ri,relation] of relations.entries()){
  const indexes:any[]=relation.indexes??[],observed=supplement.indexes.filter(i=>i.schema===relation.schema&&i.table===relation.name);
  if(indexes.length!==observed.length)fail('Native index inventory coverage differs');
  const seen=new Set<number>();
  for(const index of observed){
   const candidates=indexes.map((x,j)=>({x,j})).filter(({x})=>x.definition===index.definition);
   if(candidates.length!==1||seen.has(candidates[0]!.j))fail('Index definition is missing or ambiguous');
   const {x,j}=candidates[0]!;seen.add(j);
   if(x.valid!==index.valid||x.ready!==index.ready||relation.kind!==index.relationKind)fail('Native index state or relation kind disagrees');
   if(canonical(relation.parents??[])!==canonical(index.parents))fail('Native parent inventory differs');
   const observedChildren:string[]=[];
   for(const child of index.children){const stmt=await statement('TABLE '+child),ref=stmt.SelectStmt?.fromClause?.[0]?.RangeVar;if(!ref)fail('Invalid inherited child reference');const matches=relations.filter(r=>r.name===ref.relname&&(ref.schemaname===undefined||r.schema===ref.schemaname));if(matches.length!==1)fail('Inherited child is unresolved or ambiguous');observedChildren.push(JSON.stringify([matches[0].schema,matches[0].name]));}
   if(canonical(observedChildren.sort())!==canonical((children.get(JSON.stringify([relation.schema,relation.name]))??[]).sort()))fail('Native child inventory differs');
   const ast=(await statement(index.definition)).IndexStmt;
   if(!ast||ast.idxname!==index.index||ast.relation?.schemaname!==index.schema||ast.relation?.relname!==index.table||ast.accessMethod!==index.accessMethod)fail('Parsed index identity or access method disagrees');
   if((ast.unique===true)!==index.unique||(ast.nulls_not_distinct===true)!==index.nullsNotDistinct)fail('Parsed uniqueness/null treatment disagrees');
   if((ast.whereClause!==undefined)!==(index.predicate!==null))fail('Predicate presence disagrees');
   if(index.predicate!==null&&canonical((await expression(index.predicate))[0])!==canonical(ast.whereClause))fail('Index predicate expression disagrees');
   const keyParams=ast.indexParams??[],includeParams=ast.indexIncludingParams??[],params=[...keyParams,...includeParams];
   if(keyParams.length!==index.keyCount||params.length!==index.attributeCount)fail('Parsed key/include counts disagree');
   const expressions=params.filter(p=>p.IndexElem?.expr!==undefined).map(p=>p.IndexElem.expr);
   if(canonical(expressions)!==canonical(index.expressions===null?[]:await expression(index.expressions)))fail('Index expression list disagrees');
   const componentPaths=await Promise.all(index.components.map(async(c,ci)=>{
    const param=params[ci]?.IndexElem;if(!param)fail('Missing parsed index component');
    if(c.attribute===0){if(param.name!==undefined||param.expr===undefined)fail('Expression component syntax disagrees');return null;}
    if(param.name!==c.name||param.expr!==undefined)fail('Column component syntax disagrees');
    const cols=(relation.columns??[]).map((col:any,k:number)=>({col,k})).filter(({col}:any)=>col.position===c.attribute&&col.name===c.name);
    if(cols.length!==1)fail('Column component does not resolve uniquely');const {col,k}=cols[0];
    if(col.notNull!==c.notNull||col.type!==c.type||col.nativeType?.schema!==c.typeSchema||col.nativeType?.name!==c.typeName||col.nativeType?.kind!==c.typeKind)fail('Column type or nullability disagrees');
    if(c.collation){const definitions=collations.filter(x=>x.schema===c.collation!.schema&&x.name===c.collation!.name);if(definitions.length>1||definitions.length===1&&Object.keys(c.collation).some(k=>(c.collation as any)[k]!==definitions[0][k]))fail('Collation catalog observations disagree');}
    if(ci<index.keyCount&&param.collation===undefined){
     if(col.collation===null&&c.collation!==null||col.collation!==null&&c.collation===null)fail('Default column/index collation presence disagrees');
     if(col.collation!==null){const expr=(await expression("'' COLLATE "+col.collation))[0],parts=expr?.CollateClause?.collname?.map((p:any)=>p.String?.sval);if(!Array.isArray(parts)||parts.at(-1)!==c.collation!.name||parts.length===2&&parts[0]!==c.collation!.schema)fail('Default column/index collation identity disagrees');}
    }
    if(param.collation){const parts=param.collation.map((p:any)=>p.String?.sval);if(!c.collation||parts.at(-1)!==c.collation.name||parts.length===2&&parts[0]!==c.collation.schema||parts.length>2)fail('Explicit collation identity disagrees');}
    if(param.opclass){const parts=param.opclass.map((p:any)=>p.String?.sval);if(typeof c.operatorClass!=='string'||!(parts.length===1?c.operatorClass.endsWith('.'+parts[0]):parts.length===2&&c.operatorClass===parts.join('.')))fail('Explicit operator class disagrees');}
    return `/snapshot/relations/${ri}/columns/${k}`;
   }));
   const constraints=(relation.constraints??[]).filter((c:any)=>c.kind==='p'||c.kind==='u');
   if(index.constraint){const c=index.constraint,matches=constraints.filter((s:any)=>s.name===c.name);if(matches.length!==1||Object.keys(c).some(k=>(c as any)[k]!==matches[0][k]))fail('Constraint observations disagree');if(index.immediate===c.deferrable)fail('Constraint timing and index enforcement disagree');}
   else if(!index.immediate||index.primary)fail('Standalone index cannot claim deferred or primary constraint semantics');
   matches.push({identity:{schema:index.schema,table:index.table,index:index.index},relationPath:`/snapshot/relations/${ri}`,indexPath:`/snapshot/relations/${ri}/indexes/${j}`,componentPaths});
  }
  const constraints=(relation.constraints??[]).filter((c:any)=>c.kind==='p'||c.kind==='u');
  if(constraints.length!==observed.filter(i=>i.constraint!==null).length||constraints.some((c:any)=>observed.filter(i=>i.constraint?.name===c.name).length!==1))fail('Primary/unique constraint inventory coverage differs');
 }
 if(matches.length!==supplement.indexes.length)fail('Supplement contains indexes absent from retained catalog');
 const result={nativeSupplement:supplement.nativeSource,root:supplement.root,nativeCatalog:native.json,matches,sameSnapshotVerified:false as const,authenticated:false as const,idealEqualityVerified:false as const};
 if(!checkResult(result))fail(JSON.stringify(checkResult.errors));return result;
}
