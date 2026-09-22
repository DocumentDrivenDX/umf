import {copyJson} from '../../model/json';
import type {Json} from '../../model/types';
/** Closed T-SQL expression subset. Syntax alone never proves enforcement. */
export type SqlServerFacetPredicateCandidate=
 |{kind:'bound';operator:'>='|'<=';literal:string}
 |{kind:'length';measure:'len'|'datalength'|'len-with-sentinel';operator:'<='|'=';limit:string}
 |{kind:'scale';functionName:'round';scale:string;truncate:true};
export interface SqlServerFacetPredicateInspection {native:Json;state:'candidate'|'unsupported';candidates:SqlServerFacetPredicateCandidate[];requires:'catalog-type-association-enforcement-and-collation-evidence'}
type Token={kind:'word'|'identifier'|'number'|'unicode-string'|'punct';value:string};
type Node={kind:'column';name:string}|{kind:'number';value:string}|{kind:'unicode-string';value:string}|{kind:'call';name:string;args:Node[]}|{kind:'binary';operator:string;left:Node;right:Node};
function tokens(text:string):Token[]|undefined{
 if(text.length>65536)return;const out:Token[]=[];let i=0;
 while(i<text.length){
  const c=text[i]!;if(/[ \t\r\n]/.test(c)){i++;continue;}
  if(out.length>=4096||text.startsWith('--',i))return;
  if(c==='['){let value='',closed=false;i++;while(i<text.length){if(text[i]===']'){if(text[i+1]===']'){value+=']';i+=2;continue;}i++;closed=true;break;}value+=text[i++];}if(!closed||!value)return;out.push({kind:'identifier',value});continue;}
  if((c==='N'||c==='n')&&text[i+1]==="'"){let value='',closed=false;i+=2;while(i<text.length){if(text[i]==="'"){if(text[i+1]==="'"){value+="'";i+=2;continue;}i++;closed=true;break;}value+=text[i++];}if(!closed)return;out.push({kind:'unicode-string',value});continue;}
  const word=/^[A-Za-z_][A-Za-z_0-9]*/.exec(text.slice(i));if(word){out.push({kind:'word',value:word[0]});i+=word[0].length;continue;}
  const number=/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/.exec(text.slice(i));if(number){if(number[0].length>4096)return;out.push({kind:'number',value:number[0]});i+=number[0].length;continue;}
  const pair=text.slice(i,i+2);if(pair==='>='||pair==='<='){out.push({kind:'punct',value:pair});i+=2;continue;}
  if('(),=+-'.includes(c)){out.push({kind:'punct',value:c});i++;continue;}
  return;
 }return out;
}
function parse(input:Token[]):Node|undefined{
 let at=0,bad=false;
 const is=(value:string)=>input[at]?.kind==='punct'&&input[at]?.value===value;
 function expression(min=0,depth=0):Node|undefined{
  if(depth>64){bad=true;return;}const token=input[at++];if(!token)return;
  let left:Node|undefined;
  if(token.kind==='punct'&&token.value==='('){left=expression(0,depth+1);if(!is(')'))return;at++;}
  else if(token.kind==='punct'&&token.value==='-'){const value=expression(4,depth+1);if(value?.kind!=='number'||value.value.startsWith('-'))return;left={kind:'number',value:'-'+value.value};}
  else if(token.kind==='number'||token.kind==='unicode-string')left={kind:token.kind,value:token.value};
  else if(token.kind==='identifier')left={kind:'column',name:token.value};
  else if(token.kind==='word'){
   if(is('(')){at++;const args:Node[]=[];if(!is(')'))while(true){if(args.length>=3)return;const arg=expression(0,depth+1);if(!arg)return;args.push(arg);if(!is(','))break;at++;}if(!is(')'))return;at++;left={kind:'call',name:token.value.toLowerCase(),args};}
   else left={kind:'column',name:token.value};
  }
  if(!left)return;
  while(at<input.length){
   const next=input[at]!,operator=next.kind==='word'&&next.value.toUpperCase()==='AND'?'AND':next.kind==='punct'?next.value:'';
   const priority=operator==='AND'?1:['>=','<=','='].includes(operator)?2:['+','-'].includes(operator)?3:0;
   if(!priority||priority<min)break;at++;const right=expression(priority+1,depth+1);if(!right)return;left={kind:'binary',operator,left,right};
  }
  return left;
 }
 const result=expression();return !bad&&at===input.length?result:undefined;
}
const col=(node:Node|undefined,name:string)=>node?.kind==='column'&&node.name===name;
const uint=(node:Node|undefined)=>node?.kind==='number'&&/^(0|[1-9][0-9]*)$/.test(node.value)?node.value:undefined;
function term(node:Node,name:string):SqlServerFacetPredicateCandidate|undefined{
 if(node.kind!=='binary')return;
 if(['>=','<='].includes(node.operator)&&col(node.left,name)&&node.right.kind==='number')return {kind:'bound',operator:node.operator as '>='|'<=',literal:node.right.value};
 if(node.operator==='='&&col(node.left,name)&&node.right.kind==='call'&&node.right.name==='round'&&node.right.args.length===3&&col(node.right.args[0],name)&&uint(node.right.args[2])==='1'){
  const scale=uint(node.right.args[1]);if(scale!==undefined)return {kind:'scale',functionName:'round',scale,truncate:true};
 }
 const limit=uint(node.right);if(limit===undefined||!(node.operator==='<='||node.operator==='='&&limit==='0'))return;
 const fn=node.left;
 if(fn.kind==='call'&&['len','datalength'].includes(fn.name)&&fn.args.length===1&&col(fn.args[0],name))return {kind:'length',measure:fn.name as 'len'|'datalength',operator:node.operator as '<='|'=',limit};
 if(fn.kind==='binary'&&fn.operator==='-'&&uint(fn.right)==='1'&&fn.left.kind==='call'&&fn.left.name==='len'&&fn.left.args.length===1){
  const arg=fn.left.args[0];if(arg?.kind==='binary'&&arg.operator==='+'&&col(arg.left,name)&&arg.right.kind==='unicode-string'&&arg.right.value==='x')return {kind:'length',measure:'len-with-sentinel',operator:node.operator as '<='|'=',limit};
 }
}
export function inspectSqlServerFacetPredicate(input:unknown,columnName:string):SqlServerFacetPredicateInspection{
 const native=copyJson(input),result=(candidates:SqlServerFacetPredicateCandidate[]|undefined):SqlServerFacetPredicateInspection=>({native,state:candidates?'candidate':'unsupported',candidates:candidates??[],requires:'catalog-type-association-enforcement-and-collation-evidence'});
 if(typeof native!=='string'||typeof columnName!=='string'||!columnName||columnName.length>128||columnName.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(columnName))return result(undefined);
 const inputTokens=tokens(native),root=inputTokens&&parse(inputTokens);if(!root)return result(undefined);
 const candidates:SqlServerFacetPredicateCandidate[]=[];
 function walk(node:Node,depth=0):boolean{if(depth>64||candidates.length>=128)return false;if(node.kind==='binary'&&node.operator==='AND')return walk(node.left,depth+1)&&walk(node.right,depth+1);const t=term(node,columnName);if(!t)return false;candidates.push(t);return true;}
 return result(walk(root)?candidates:undefined);
}
