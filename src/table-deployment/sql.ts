// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreLiteral} from '../model/schema-literals';
import type {TableExpression,TableNativeType,TableDeclaration,TableColumn} from '../extensions/tables';
import type {DeploymentContext} from './types';
import {deploymentError} from './configuration';
import {nativeDate,nativeInstant} from './temporal';
export const quoteIdentifier=(value:string):string=>'"'+value.replaceAll('"','""')+'"';
/** E quoting does not depend on standard_conforming_strings or host search_path. */
export const quoteText=(value:string):string=>{
 if(value.includes('\0'))deploymentError('PostgreSQL string cannot contain NUL');
 return "E'"+value.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
};
const nativeNames:Record<string,string>={boolean:'bool',text:'text',varchar:'varchar',char:'bpchar',int2:'int2',int4:'int4',int8:'int8',float4:'float4',float8:'float8',numeric:'numeric',date:'date',timestamp:'timestamp',timestamptz:'timestamptz',uuid:'uuid',bytea:'bytea'};
export function nativeTypeExpectation(type:TableNativeType):{typeSchema:'pg_catalog';typeName:string;typeMod:number}{
 return {typeSchema:'pg_catalog',typeName:nativeNames[type.kind]!,typeMod:type.kind==='varchar'||type.kind==='char'?type.length+4:type.kind==='numeric'?(type.precision<<16)+type.scale+4:-1};
}
export function nativeType(type:TableNativeType):string{
 const name='pg_catalog.'+quoteIdentifier(nativeNames[type.kind]!);
 return type.kind==='varchar'||type.kind==='char'?name+'('+type.length+')':type.kind==='numeric'?name+'('+type.precision+','+type.scale+')':name;
}
export function columnDefinitionSql(column:TableColumn,nullable:boolean):string{
 let definition=quoteIdentifier(column.name)+' '+nativeType(column.nativeType);
 if(['text','varchar'].includes(column.nativeType.kind))definition+=' COLLATE pg_catalog."C"';
 if(!nullable)definition+=' NOT NULL';
 if(column.generated)definition+=' GENERATED '+(column.generated.generation==='always'?'ALWAYS':'BY DEFAULT')+' AS IDENTITY';
 if(column.default)definition+=' DEFAULT '+typedDefaultExpressionSql(column.default);
 return definition;
}
/** Render the closed typed native-default vocabulary used by deployment and migration DDL. */
export function typedDefaultExpressionSql(value:NonNullable<TableColumn['default']>):string{
 return value.kind==='literal'?literalSql(value.value):value.kind==='randomUuid'?'pg_catalog.gen_random_uuid()':'CURRENT_TIMESTAMP';
}
function numericToken(token:string):string{
 const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
 if(!match)deploymentError('Exact numeric literal required');
 const fraction=match![3]??'',digits=(match![2]!+fraction).replace(/^0+/,'');
 if(!digits)return '0';
 const trimmed=digits.replace(/0+$/,''),exponent=BigInt(match![4]??'0')-BigInt(fraction.length)+BigInt(digits.length-trimmed.length);
 if(BigInt(trimmed.length)+exponent>131072n||exponent < -16383n)deploymentError('Literal exceeds finite PostgreSQL numeric capacity');
 return match![1]+trimmed+(exponent===0n?'':'e'+exponent);
}
export function literalSql(value:CoreLiteral):string{
 if(value===null)return 'NULL';
 if('boolean'in value)return value.boolean?'TRUE':'FALSE';
 if('string'in value)return '('+quoteText(value.string)+'::pg_catalog.text COLLATE pg_catalog."C")';
 if('integerToken'in value)return quoteText(numericToken(value.integerToken))+'::pg_catalog.numeric';
 if('decimalToken'in value)return quoteText(numericToken(value.decimalToken))+'::pg_catalog.numeric';
 if('uuid'in value)return quoteText(value.uuid)+'::pg_catalog.uuid';
 if('date'in value)return quoteText(nativeDate(value.date))+'::pg_catalog.date';
 if('timestamp'in value)return quoteText(nativeInstant(value.timestamp))+'::pg_catalog.timestamptz';
 if('binaryHex'in value)return "pg_catalog.decode("+quoteText(value.binaryHex)+",'hex')";
 if('bits128Hex'in value)return "pg_catalog.decode("+quoteText(value.bits128Hex)+",'hex')";
 deploymentError('Literal carrier is not qualified for deployment expressions');
}
export function expressionSql(expr:TableExpression,table:TableDeclaration,ctx:DeploymentContext):string{
 if(expr.op==='field')return quoteIdentifier(ctx.column(table,expr.field));
 if(expr.op==='literal')return literalSql(expr.value);
 if(expr.op==='and'||expr.op==='or')return '('+expr.args.map(e=>expressionSql(e,table,ctx)).join(expr.op==='and'?' AND ':' OR ')+')';
 if(expr.op==='not')return '(NOT '+expressionSql(expr.arg,table,ctx)+')';
 if(expr.op==='isNull')return '('+expressionSql(expr.arg,table,ctx)+' IS NULL)';
 if(expr.op==='in')return '('+expressionSql(expr.arg,table,ctx)+' IN ('+expr.values.map(literalSql).join(', ')+'))';
 const operators={eq:'=',ne:'<>',lt:'<',le:'<=',gt:'>',ge:'>='};
 if('left'in expr)return '('+expressionSql(expr.left,table,ctx)+' '+operators[expr.op]+' '+expressionSql(expr.right,table,ctx)+')';
 return deploymentError('Unknown check expression');
}
