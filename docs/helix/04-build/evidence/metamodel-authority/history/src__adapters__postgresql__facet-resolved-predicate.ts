import {copyJson} from '../../model/json';
import type {Json} from '../../model/types';
import {readFacetNodeTree,decodeFacetConstant,type PgFacetNode,type PgFacetValue} from './facet-node-tree';
export type ResolvedFacetTerm=
 |{kind:'bound';operator:'>='|'<=';literal:string}
 |{kind:'length';unit:'unicode-scalar'|'byte';max:string}
 |{kind:'scale';scale:string};
export interface ResolvedFacetInspection {
 native:Json;state:'verified-expression'|'unsupported';terms:ResolvedFacetTerm[];
 nonNullValuesOnly:true;
 valueScope?:'stored-and-new-values'|'new-values-only';
 requires:'retained-catalog-correspondence-and-projection-scope';
}
type Obj=Record<string,Json>;
const object=(v:Json|undefined):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isNode=(v:PgFacetValue|undefined):v is PgFacetNode=>v!==undefined&&typeof v==='object'&&!Array.isArray(v);
function closed(n:PgFacetNode,tag:string,keys:string[]):boolean{return n.tag===tag&&Object.keys(n.fields).length===keys.length&&Object.keys(n.fields).every(k=>keys.includes(k));}
const opKeys=['opno','opfuncid','opresulttype','opretset','opcollid','inputcollid','args','location'];
// OIDs and signatures observed in the pinned PostgreSQL 17.4 native corpus.
const operators:Record<string,readonly string[]>={
 '523':['<=','149','int4le','23','23'],
 '420':['<=','478','int84le','20','23'],'430':['>=','479','int84ge','20','23'],
 '414':['<=','471','int8le','20','20'],
 '540':['<=','166','int24le','21','23'],'542':['>=','168','int24ge','21','23'],
 '1752':['=','1718','numeric_eq','1700','1700'],'1755':['<=','1723','numeric_le','1700','1700'],'1757':['>=','1721','numeric_ge','1700','1700'],
};
const functions:Record<string,readonly string[]>={
 '720':['octet_length','23','[0:0]={17}','17'],
 '1381':['char_length','23','[0:0]={25}','25'],
 '1709':['trunc','1700','[0:1]={1700,23}','1700'],
};
/** Internal qualification of one analyzed table CHECK. Input must come from the
 * explicit PostgreSQL 17.4 / UTF8 / little-endian Datum64 capture profile.
 * A verified predicate is not a core facet, an exact-input guarantee, or proof
 * that the capture corresponds to a separately retained schema. */
export function inspectResolvedFacetPredicate(input:unknown,profile:{serverVersion:number;encoding:string;datumFormat:string}):ResolvedFacetInspection{
 const native=copyJson(input),context=copyJson(profile),terms:ResolvedFacetTerm[]=[];
 const result=(ok:boolean):ResolvedFacetInspection=>({native,nonNullValuesOnly:true,state:ok?'verified-expression':'unsupported',terms:ok?terms:[],...(ok&&object(native)?{valueScope:native.validated?'stored-and-new-values' as const:'new-values-only' as const}:{}),requires:'retained-catalog-correspondence-and-projection-scope'});
 if(!object(context)||context.serverVersion!==170004||context.encoding!=='UTF8'||context.datumFormat!=='little-endian-datum64'||!object(native))return result(false);
 const c=native;
 if(c.relationKind!=='r'||typeof c.validated!=='boolean'||c.isLocal!==true||c.inheritanceCount!==0||c.parentOid!=='0'||typeof c.noInherit!=='boolean'||typeof c.nodeTree!=='string'||!Array.isArray(c.columnNumbers)||c.columnNumbers.length!==1||!Array.isArray(c.columns)||!Array.isArray(c.operatorLookups)||!Array.isArray(c.functionLookups))return result(false);
 const columnNumber=c.columnNumbers[0];
 if(typeof columnNumber!=='number'||!Number.isSafeInteger(columnNumber)||columnNumber<1||columnNumber>1600)return result(false);
 const selected=c.columns.filter(col=>object(col)&&col.number===columnNumber);if(selected.length!==1||!object(selected[0]))return result(false);
 const col=selected[0];
 if(col.typeSchema!=='pg_catalog'||col.typeKind!=='b'||col.dimensions!==0||typeof col.modifier!=='number'||!Number.isSafeInteger(col.modifier)||col.modifier< -1||col.modifier>2147483647)return result(false);
 const typeNames:Record<string,string>={'21':'int2','23':'int4','20':'int8','1700':'numeric','25':'text','17':'bytea'};
 if(typeof col.typeOid!=='string'||typeNames[col.typeOid]!==col.typeName)return result(false);
 const ops=new Map<string,Obj>(),fns=new Map<string,Obj>();
 for(const [rows,map] of [[c.operatorLookups,ops],[c.functionLookups,fns]] as const)for(const row of rows){if(!object(row)||typeof row.oid!=='string'||map.has(row.oid))return result(false);map.set(row.oid,row);}
 const usedOps=new Set<string>(),usedFns=new Set<string>();
 const tree=readFacetNodeTree(c.nodeTree);if(!tree)return result(false);
 function variable(n:PgFacetValue|undefined):string|undefined{
  if(!isNode(n)||!closed(n,'VAR',['varno','varattno','vartype','vartypmod','varcollid','varnullingrels','varlevelsup','varnosyn','varattnosyn','location']))return;
  const f=n.fields;
  if(f.varno!=='1'||f.varattno!==String(col.number)||f.vartype!==col.typeOid||f.vartypmod!==String(col.modifier)||f.varlevelsup!=='0'||f.varnosyn!=='1'||f.varattnosyn!==String(col.number)||f.location!=='-1'||JSON.stringify(f.varnullingrels)!=='["b"]'||f.varcollid!==(col.typeOid==='25'?'100':'0'))return;
  return col.typeOid as string;
 }
 function constant(n:PgFacetValue|undefined):{type:string;value:string}|undefined{
  if(!isNode(n))return;const value=decodeFacetConstant(n);return value!==undefined&&typeof n.fields.consttype==='string'?{type:n.fields.consttype,value}:undefined;
 }
 function fn(n:PgFacetValue|undefined):{name:string;type:string;scale?:string}|undefined{
  if(!isNode(n)||!closed(n,'FUNCEXPR',['funcid','funcresulttype','funcretset','funcvariadic','funcformat','funccollid','inputcollid','args','location']))return;
  const f=n.fields;if(typeof f.funcid!=='string')return;
  const spec=functions[f.funcid],lookup=fns.get(f.funcid);if(!spec||!lookup)return;
  if(lookup.schema!=='pg_catalog'||lookup.name!==spec[0]||lookup.resultTypeOid!==spec[1]||lookup.argumentTypeOids!==spec[2]||lookup.kind!=='f'||lookup.volatility!=='i'||lookup.strict!==true||f.funcresulttype!==spec[1]||f.funcretset!=='false'||f.funcvariadic!=='false'||f.funcformat!=='0'||f.funccollid!=='0'||f.inputcollid!==(spec[3]==='25'?'100':'0')||f.location!=='-1'||!Array.isArray(f.args)||variable(f.args[0])!==spec[3])return;
  if(spec[0]==='trunc'){
   const scale=constant(f.args[1]);if(f.args.length!==2||scale?.type!=='23'||! /^(0|[1-9][0-9]*)$/.test(scale.value))return;
   usedFns.add(f.funcid);return {name:spec[0],type:spec[1]!,scale:scale.value};
  }
  if(f.args.length!==1)return;usedFns.add(f.funcid);return {name:spec[0]!,type:spec[1]!};
 }
 function walk(n:PgFacetValue|undefined):boolean{
  if(!isNode(n))return false;
  if(n.tag==='BOOLEXPR')return closed(n,'BOOLEXPR',['boolop','args','location'])&&n.fields.boolop==='and'&&n.fields.location==='-1'&&Array.isArray(n.fields.args)&&n.fields.args.length>=2&&n.fields.args.every(walk);
  if(!closed(n,'OPEXPR',opKeys))return false;
  const f=n.fields;if(typeof f.opno!=='string')return false;const spec=operators[f.opno],lookup=ops.get(f.opno);
  if(!spec||!lookup||lookup.schema!=='pg_catalog'||lookup.name!==spec[0]||lookup.functionOid!==spec[1]||lookup.functionName!==spec[2]||lookup.functionSchema!=='pg_catalog'||lookup.leftTypeOid!==spec[3]||lookup.rightTypeOid!==spec[4]||lookup.resultTypeOid!=='16'||f.opfuncid!==spec[1]||f.opresulttype!=='16'||f.opretset!=='false'||f.opcollid!=='0'||f.inputcollid!=='0'||f.location!=='-1'||!Array.isArray(f.args)||f.args.length!==2)return false;
  usedOps.add(f.opno);
  const left=variable(f.args[0]),right=constant(f.args[1]);
  if(left===spec[3]&&right&&right.type===spec[4]&&(spec[0]==='<='||spec[0]==='>=')){terms.push({kind:'bound',operator:spec[0],literal:right.value});return true;}
  if(spec[0]==='<='&&right&&right.type===spec[4]&&/^(0|[1-9][0-9]*)$/.test(right.value)){
   const call=fn(f.args[0]);if(call&&call.type===spec[3]&&['char_length','octet_length'].includes(call.name)){terms.push({kind:'length',unit:call.name==='char_length'?'unicode-scalar':'byte',max:right.value});return true;}
  }
  if(spec[0]==='='&&left===spec[3]){const call=fn(f.args[1]);if(call&&call.type===spec[4]&&call.name==='trunc'&&call.scale!==undefined){terms.push({kind:'scale',scale:call.scale});return true;}}
  return false;
 }
 return result(walk(tree)&&usedOps.size===ops.size&&usedFns.size===fns.size);
}
