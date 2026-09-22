import {copyJson} from '../../model/json';
import type {NativeJson} from '../../model/native-json';
import {readJsonValue} from '../../model/serialization';
import {UmfError,type Document} from '../../model/types';
import {exportSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,SQLSERVER_EXTENSION} from './index';
import {inspectSqlServerFacetType,type SqlServerFacetTypeInspection} from './facet-type';
import {inspectSqlServerFacetPredicate,type SqlServerFacetPredicateCandidate} from './facet-predicate';

export type SqlServerFacetConstraintScope='stored-and-ordinary-checked-write-non-null'|'ordinary-checked-write-non-null';
export type SqlServerFacetConstraintFact=
 |{kind:'integer-bound';operator:'>='|'<=';literal:string}
 |{kind:'binary-byte-bound';maximum:string}
 |{kind:'decimal-stored-scale';scale:string;inputExactness:false};
export interface SqlServerFacetConstraintObservation {
 path:string;native:NativeJson;state:'interpreted'|'residual';reason:string;
 candidates:SqlServerFacetPredicateCandidate[];facts:SqlServerFacetConstraintFact[];
 scope?:SqlServerFacetConstraintScope;
}
export interface SqlServerFacetConstraintsInspection {
 nativeColumn:NativeJson;type:SqlServerFacetTypeInspection;observations:SqlServerFacetConstraintObservation[];
 checksAvailable:boolean;complete:false;sourceAuthenticity:'unverified';
}
const str=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const bool=(n:NativeJson|undefined)=>n?.kind==='boolean'?n.value:undefined;
function integer(n:NativeJson|undefined):number|undefined{
 if(n?.kind!=='number')return;
 try{const v=readJsonValue(n.value,'json');return typeof v==='number'&&Number.isSafeInteger(v)&&!Object.is(v,-0)?v:undefined;}catch(e){if(!(e instanceof UmfError))throw e;return;}
}
/** Internal interpretation of a validated catalog observation. No core assertion,
 * source authentication, complete constraint inventory or input-exactness proof.
 * Callers must retain the source document; returned observations do not replace it. */
export function inspectSqlServerFacetConstraints(input:Document,columnPath:string):SqlServerFacetConstraintsInspection{
 const document=copyJson(input) as Document;
 exportSqlServerCatalog(document); // Validate exact integers, duplicate identities and derived metadata.
 const column=getSqlServerColumnMetadata(document).find(c=>c.path===columnPath);
 if(!column)throw new UmfError('SQLSERVER_FACET_COLUMN','Unknown captured column path');
 const table=getSqlServerConstraintMetadata(document).tables.find(t=>columnPath.startsWith(t.path+'/columns/'));
 if(!table)throw new UmfError('SQLSERVER_FACET_COLUMN','Missing captured table');
 const root=(document.extensions![SQLSERVER_EXTENSION] as unknown as {root:NativeJson}).root;
 if(root.kind!=='object'||column.nativeColumn.kind!=='object')throw new UmfError('SQLSERVER_FACET_COLUMN','Expected native object');
 const c=column.nativeColumn.members,id=integer(c.column_id);
 const supportedSource=str(root.members.profile)==='sqlserver-catalog-v3'&&str(root.members.serverVersion)==='16.0.4295.3'&&str(root.members.state)==='captured';
 const type:SqlServerFacetTypeInspection=supportedSource?inspectSqlServerFacetType(column.nativeColumn):{native:column.nativeColumn,state:'unsupported',reason:'Source is outside the pinned captured v3 SQL Server profile'};
 const observations=table.checks.map((native,index):SqlServerFacetConstraintObservation=>{
  const base={path:table.path+'/checks/'+index,native,candidates:[] as SqlServerFacetPredicateCandidate[],facts:[] as SqlServerFacetConstraintFact[]};
  const residual=(reason:string,candidates:SqlServerFacetPredicateCandidate[]=base.candidates):SqlServerFacetConstraintObservation=>({...base,state:'residual',reason,candidates});
  if(!supportedSource)return residual('Source is outside the pinned captured v3 SQL Server profile');
  if(type.state!=='observed'||bool(c.is_computed)!==false||id===undefined||id<1)return residual('Direct noncomputed scalar type and column identity are required');
  if(native.kind!=='object')return residual('Expected CHECK metadata');
  const m=native.members,parent=integer(m.parent_column_id);
  // Table-level expressions require separately qualified association evidence.
  if(parent!==id)return residual(parent===0?'Table-level CHECK association is not yet qualified':'CHECK belongs to a different or unresolved column');
  const definition=str(m.definition);if(definition===undefined)return residual('CHECK definition unavailable');
  const parsed=inspectSqlServerFacetPredicate(definition,column.element.name!);
  if(parsed.state!=='candidate')return residual('Whole CHECK expression is outside the bounded syntax subset');
  const disabled=bool(m.is_disabled),untrusted=bool(m.is_not_trusted),replica=bool(m.is_not_for_replication),collation=bool(m.uses_database_collation);
  if(disabled===undefined||untrusted===undefined||replica===undefined||collation===undefined)return residual('CHECK enforcement or collation flags unavailable',parsed.candidates);
  if(disabled)return residual('Disabled CHECK supplies no enforced bound',parsed.candidates);
  const facts:SqlServerFacetConstraintFact[]=[];
  for(const p of parsed.candidates){
   if(p.kind==='bound'&&type.meaning?.family==='integer'&&/^-?(0|[1-9][0-9]{0,37})$/.test(p.literal))facts.push({kind:'integer-bound',operator:p.operator,literal:p.literal});
   else if(p.kind==='length'&&p.measure==='datalength'&&type.meaning?.family==='binary'&&p.limit.length<=19&&BigInt(p.limit)<=9223372036854775807n)facts.push({kind:'binary-byte-bound',maximum:p.limit});
   else if(p.kind==='scale'&&type.meaning?.family==='decimal'&&p.scale.length<=2&&Number(p.scale)===type.meaning.scale)facts.push({kind:'decimal-stored-scale',scale:p.scale,inputExactness:false});
   else return residual('Predicate/type combination requires additional native or collation qualification',parsed.candidates);
  }
  // Integer, binary DATALENGTH and decimal ROUND do not compare text. The catalog
  // collation flag is retained even when true; no Unicode/character claim follows.
  const scope:SqlServerFacetConstraintScope=untrusted||replica?'ordinary-checked-write-non-null':'stored-and-ordinary-checked-write-non-null';
  return {...base,state:'interpreted',reason:replica?'Replication bypass remains native; only ordinary checked writes are interpreted':untrusted?'Existing rows are unverified; only ordinary checked writes are interpreted':'Trusted enabled CHECK on the observed non-null scalar domain',candidates:parsed.candidates,facts,scope};
 });
 return {nativeColumn:column.nativeColumn,type,observations,checksAvailable:table.available.checks,complete:false,sourceAuthenticity:'unverified'};
}
