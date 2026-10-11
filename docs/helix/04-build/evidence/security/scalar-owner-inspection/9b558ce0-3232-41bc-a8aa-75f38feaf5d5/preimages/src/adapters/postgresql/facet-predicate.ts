import {copyJson} from '../../model/json';
import type {Json} from '../../model/types';

/** Syntax candidates only. Names here do not establish native resolution, CHECK
 * enforcement, validation scope, input coercion, or a core facet assertion. */
export type PostgresqlFacetPredicateCandidate =
 | {kind:'bound';operator:'>='|'<=';literal:string;cast?:string}
 | {kind:'length';functionName:string[];max:string}
 | {kind:'scale';functionName:string[];scale:string};
export interface PostgresqlFacetPredicateInspection {
 native:Json;
 state:'candidate'|'unsupported';
 candidates:PostgresqlFacetPredicateCandidate[];
 requires:'catalog-resolution-and-enforcement-evidence';
}
type Obj=Record<string,Json>;
const object=(v:Json|undefined):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function closed(v:Json|undefined,keys:string[]):v is Obj{return object(v)&&Object.keys(v).every(k=>keys.includes(k));}
function node(v:Json|undefined,name:string):Obj|undefined{return closed(v,[name])&&object(v[name])?v[name]:undefined;}
function names(v:Json|undefined):string[]|undefined{
 if(!Array.isArray(v)||!v.length)return;
 const out:string[]=[];
 for(const part of v){const n=node(part,'String');if(!closed(n,['sval'])||typeof n.sval!=='string')return;out.push(n.sval);}
 return out;
}
function column(v:Json|undefined,name:string):boolean{
 const n=node(v,'ColumnRef');if(!closed(n,['fields','location']))return false;
 const path=names(n.fields);return path?.length===1&&path[0]===name;
}
const decimal=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
function literal(v:Json|undefined):{literal:string;cast?:string}|undefined{
 const cast=node(v,'TypeCast');
 if(cast){
  if(!closed(cast,['arg','typeName','location'])||!closed(cast.typeName,['names','typemod','location'])||cast.typeName.typemod!==-1)return;
  const path=names(cast.typeName.names);
  if(path?.length!==2||path[0]!=='pg_catalog'||!['numeric','int2','int4','int8'].includes(path[1]!))return;
  const inner=constant(cast.arg,true);if(inner===undefined)return;
  return {literal:inner,cast:path[1]!};
 }
 const value=constant(v,false);return value===undefined?undefined:{literal:value};
}
function constant(v:Json|undefined,allowString:boolean):string|undefined{
 const n=node(v,'A_Const');if(!closed(n,['ival','fval',...(allowString?['sval']:[]),'location']))return;
 const variants=['ival','fval','sval'].filter(k=>n[k]!==undefined);if(variants.length!==1)return;
 const key=variants[0]!,part=n[key];if(!closed(part,[key]))return;
 // Protobuf JSON omits the zero-valued int32 field. Large SQL literals are
 // fval strings, never converted to a JavaScript number here.
 const raw=key==='ival'?(part.ival??0):part[key];
 if(key==='ival'&&(typeof raw!=='number'||!Number.isInteger(raw)||raw< -2147483648||raw>2147483647))return;
 const token=String(raw);return decimal.test(token)?token:undefined;
}
function call(v:Json|undefined,expected:string[],columnName:string,arity:number):{name:string[];args:Json[]}|undefined{
 const n=node(v,'FuncCall');if(!closed(n,['funcname','args','funcformat','location'])||n.funcformat!=='COERCE_EXPLICIT_CALL'||!Array.isArray(n.args)||n.args.length!==arity||!column(n.args[0],columnName))return;
 const path=names(n.funcname);if(!path||!(path.length===1||path.length===2&&path[0]==='pg_catalog')||!expected.includes(path.at(-1)!))return;
 return {name:path,args:n.args};
}
function term(v:Json|undefined,columnName:string):PostgresqlFacetPredicateCandidate|undefined{
 const n=node(v,'A_Expr');if(!closed(n,['kind','name','lexpr','rexpr','location'])||n.kind!=='AEXPR_OP')return;
 const path=names(n.name);if(path?.length!==1)return;
 const op=path[0];
 if((op==='>='||op==='<=')&&column(n.lexpr,columnName)){
  const value=literal(n.rexpr);if(value)return {kind:'bound',operator:op,...value};
 }
 if(op==='<='){
  const fn=call(n.lexpr,['char_length','octet_length'],columnName,1),max=constant(n.rexpr,false);
  if(fn&&max!==undefined&&/^(0|[1-9][0-9]*)$/.test(max))return {kind:'length',functionName:fn.name,max};
 }
 if(op==='='&&column(n.lexpr,columnName)){
  const fn=call(n.rexpr,['trunc'],columnName,2),scale=fn&&constant(fn.args[1],false);
  if(fn&&scale!==undefined&&/^(0|[1-9][0-9]*)$/.test(scale))return {kind:'scale',functionName:fn.name,scale};
 }
}
/** Inspect a pinned parser SELECT-expression tree, retaining every native node.
 * This intentionally has no Document input/output and cannot promote a facet.
 * Unknown syntax rejects the entire expression, including known conjuncts. */
export function inspectPostgresqlFacetPredicate(input:unknown,columnName:string):PostgresqlFacetPredicateInspection{
 const native=copyJson(input),candidates:PostgresqlFacetPredicateCandidate[]=[];
 const result=(ok:boolean):PostgresqlFacetPredicateInspection=>({native,state:ok?'candidate':'unsupported',candidates:ok?candidates:[],requires:'catalog-resolution-and-enforcement-evidence'});
 if(!closed(native,['version','stmts'])||native.version!==170004||!Array.isArray(native.stmts)||native.stmts.length!==1)return result(false);
 const stmt=native.stmts[0];if(!closed(stmt,['stmt','stmt_location','stmt_len']))return result(false);
 const select=node(stmt.stmt,'SelectStmt');
 if(!closed(select,['targetList','limitOption','op'])||select.limitOption!=='LIMIT_OPTION_DEFAULT'||select.op!=='SETOP_NONE'||!Array.isArray(select.targetList)||select.targetList.length!==1)return result(false);
 const target=node(select.targetList[0],'ResTarget');if(!closed(target,['val','location']))return result(false);
 function walk(v:Json|undefined):boolean{
  const and=node(v,'BoolExpr');
  if(and)return closed(and,['boolop','args','location'])&&and.boolop==='AND_EXPR'&&Array.isArray(and.args)&&and.args.length>=2&&and.args.every(walk);
  const candidate=term(v,columnName);if(!candidate)return false;candidates.push(candidate);return true;
 }
 return result(walk(target.val));
}
