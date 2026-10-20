// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Element} from '../../model/types';
import {domain,refKey,TableContext} from './context';
import type {TableExpression,TableRef} from './types';
interface Result {kind:string;field?:Element;literal?:unknown}
const literalKind=(v:any):string=>v===null?'null':({integerToken:'integer',decimalToken:'decimal',floatToken:'float',binaryHex:'binary',bits128Hex:'bits128'} as Record<string,string>)[Object.keys(v)[0]!]??Object.keys(v)[0]!;
export function inspectExpression(expr:TableExpression,fields:readonly TableRef[],ctx:TableContext,path:string,depth=0):Result{
 if(!ctx.charge(path,depth))return {kind:'unknown'};
 if(expr.op==='field'){
  if(!fields.some(f=>refKey(f)===refKey(expr.field)))ctx.add('TABLES_EXPRESSION_SCOPE',path+'/field','Check field is not a member of this table');
  const field=ctx.field(expr.field,path+'/field');return {kind:field?.scalarType??'unknown',...(field?{field}:{})};
 }
 if(expr.op==='literal')return {kind:literalKind(expr.value),literal:expr.value};
 if(expr.op==='and'||expr.op==='or'){
  for(const[i,arg]of expr.args.entries())if(inspectExpression(arg,fields,ctx,path+'/args/'+i,depth+1).kind!=='boolean')ctx.add('TABLES_EXPRESSION_TYPE',path+'/args/'+i,'Boolean operand required');
  return {kind:'boolean'};
 }
 if(expr.op==='not'||expr.op==='isNull'){
  const arg=inspectExpression(expr.arg,fields,ctx,path+'/arg',depth+1);
  if(expr.op==='not'&&arg.kind!=='boolean')ctx.add('TABLES_EXPRESSION_TYPE',path+'/arg','Boolean operand required');return {kind:'boolean'};
 }
 const compare=(left:Result,right:Result,location:string)=>{
  if(left.kind!=='null'&&right.kind!=='null'&&(left.kind!==right.kind||left.field&&right.field&&domain(left.field)!==domain(right.field)))ctx.add('TABLES_EXPRESSION_TYPE',location,'Comparison domains must agree without coercion');
  if(left.field&&right.literal!==undefined)ctx.literal(left.field,right.literal,location);
  if(right.field&&left.literal!==undefined)ctx.literal(right.field,left.literal,location);
 };
 if(expr.op==='in'){
  const arg=inspectExpression(expr.arg,fields,ctx,path+'/arg',depth+1);
  for(const[i,value]of expr.values.entries())compare(arg,{kind:literalKind(value),literal:value},path+'/values/'+i);
 }else if('left'in expr){compare(inspectExpression(expr.left,fields,ctx,path+'/left',depth+1),inspectExpression(expr.right,fields,ctx,path+'/right',depth+1),path);}
 return {kind:'boolean'};
}
