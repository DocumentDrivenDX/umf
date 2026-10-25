// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreLiteral} from '../model/schema-literals';
import type {TableExpression,TableNativeType,TableDeclaration,TableColumn} from '../extensions/tables';
import type {DeploymentContext} from './types';
import type {AccountingContext} from '../model/internal/accounting-context';
import {deploymentError} from './configuration';
import {nativeDate,nativeInstant,nativeDateCharged,nativeInstantCharged} from './temporal';
function utf8Bytes(value:string):number{let bytes=0;for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c<0x80)bytes++;else if(c<0x800)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}else bytes+=3;}return bytes;}
/** Charge the exact retained SQL bytes before join allocates its result. */
export function sqlJoin(parts:readonly string[],accounting?:AccountingContext,path='/sql'):string{
 if(accounting){let bytes=0;for(const part of parts){const next=bytes+utf8Bytes(part);if(!Number.isSafeInteger(next))throw new RangeError('SQL byte count overflow');bytes=next;}accounting.retainBytes('sql-fragment',bytes,path);}
 return parts.join('');
}
export const quoteIdentifier=(value:string,accounting?:AccountingContext,path='/sql/identifier'):string=>{
 if(accounting)accounting.visit('sql-identifier-escape-scan',path,value.length);
 let quotes=0;for(let i=0;i<value.length;i++)if(value.charCodeAt(i)===34)quotes++;
 if(accounting)accounting.retainBytes('sql-identifier-escape-pass',utf8Bytes(value)+quotes,path);
 const escaped=value.replaceAll('"','""');
 if(accounting)accounting.retainBytes('sql-quoted-identifier',utf8Bytes(escaped)+2,path);
 return '"'+escaped+'"';
};
/** E quoting does not depend on standard_conforming_strings or host search_path. */
export const quoteText=(value:string,accounting?:AccountingContext,path='/sql/text'):string=>{
 if(accounting)accounting.visit('sql-text-nul-scan',path,value.length);
 if(value.includes('\0'))deploymentError('PostgreSQL string cannot contain NUL');
 if(accounting)accounting.visit('sql-text-escape-scan',path,value.length);
 let slashes=0,quotes=0;for(let i=0;i<value.length;i++){if(value.charCodeAt(i)===92)slashes++;if(value.charCodeAt(i)===39)quotes++;}
 if(accounting)accounting.retainBytes('sql-text-backslash-escape-pass',utf8Bytes(value)+slashes,path);
 const escapedSlashes=value.replaceAll('\\','\\\\');
 if(accounting)accounting.retainBytes('sql-text-quote-escape-pass',utf8Bytes(escapedSlashes)+quotes,path);
 const escaped=escapedSlashes.replaceAll("'","''");
 if(accounting)accounting.retainBytes('sql-quoted-text',utf8Bytes(escaped)+3,path);
 return "E'"+escaped+"'";
};
const nativeNames:Record<string,string>={boolean:'bool',text:'text',varchar:'varchar',char:'bpchar',int2:'int2',int4:'int4',int8:'int8',float4:'float4',float8:'float8',numeric:'numeric',date:'date',timestamp:'timestamp',timestamptz:'timestamptz',uuid:'uuid',bytea:'bytea'};
export function nativeTypeExpectation(type:TableNativeType,accounting?:AccountingContext,path='/sql/type-expectation'):{typeSchema:'pg_catalog';typeName:string;typeMod:number}{
 accounting?.visit('sql-native-type-expectation-object',path,3);
 return {typeSchema:'pg_catalog',typeName:nativeNames[type.kind]!,typeMod:type.kind==='varchar'||type.kind==='char'?type.length+4:type.kind==='numeric'?(type.precision<<16)+type.scale+4:-1};
}
export function nativeType(type:TableNativeType,accounting?:AccountingContext,path='/sql/type'):string{
 const name=sqlJoin(['pg_catalog.',quoteIdentifier(nativeNames[type.kind]!,accounting,path)],accounting,path);
 return type.kind==='varchar'||type.kind==='char'?sqlJoin([name,'(',String(type.length),')'],accounting,path):type.kind==='numeric'?sqlJoin([name,'(',String(type.precision),',',String(type.scale),')'],accounting,path):name;
}
export function columnDefinitionSql(column:TableColumn,nullable:boolean,accounting?:AccountingContext,path='/sql/column'):string{
 const parts=[quoteIdentifier(column.name,accounting,`${path}/name`),' ',nativeType(column.nativeType,accounting,`${path}/type`)];
 if(['text','varchar'].includes(column.nativeType.kind))parts.push(' COLLATE pg_catalog."C"');
 if(!nullable)parts.push(' NOT NULL');
 if(column.generated)parts.push(' GENERATED ',column.generated.generation==='always'?'ALWAYS':'BY DEFAULT',' AS IDENTITY');
 if(column.default)parts.push(' DEFAULT ',typedDefaultExpressionSql(column.default,accounting,`${path}/default`));
 return sqlJoin(parts,accounting,path);
}
/** Render the closed typed native-default vocabulary used by deployment and migration DDL. */
export function typedDefaultExpressionSql(value:NonNullable<TableColumn['default']>,accounting?:AccountingContext,path='/sql/default'):string{
 return value.kind==='literal'?literalSql(value.value,accounting,path):value.kind==='randomUuid'?'pg_catalog.gen_random_uuid()':'CURRENT_TIMESTAMP';
}
function numericToken(token:string,accounting?:AccountingContext,path='/sql/numeric'):string{
 if(accounting){accounting.scanUtf8(token,path);accounting.visit('sql-numeric-token-scan',path,token.length);}
 const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
 if(!match)deploymentError('Exact numeric literal required');
 const fraction=match![3]??'',allDigitsLength=match![2]!.length+fraction.length;
 accounting?.retainBytes('sql-numeric-digit-concatenation',allDigitsLength,path);
 const allDigits=match![2]!+fraction;
 let first=0;while(first<allDigits.length&&allDigits.charCodeAt(first)===48)first++;
 if(first===allDigits.length)return '0';
 let end=allDigits.length;while(end>first&&allDigits.charCodeAt(end-1)===48)end--;
 const significantLength=end-first;accounting?.retainBytes('sql-numeric-significant-digits',significantLength,path);
 const significant=allDigits.slice(first,end);
 const exponent=BigInt(match![4]??'0')-BigInt(fraction.length)+BigInt(allDigits.length-end);
 if(BigInt(significantLength)+exponent>131072n||exponent < -16383n)deploymentError('Literal exceeds finite PostgreSQL numeric capacity');
 if(exponent===0n)return sqlJoin([match![1]!,significant],accounting,path);
 let exponentDigits=1,exponentMagnitude=exponent<0n?-exponent:exponent;while(exponentMagnitude>=10n){accounting?.visit('sql-numeric-exponent-width',path);exponentMagnitude/=10n;exponentDigits++;}
 accounting?.retainBytes('sql-numeric-exponent-text',exponentDigits+(exponent<0n?1:0),path);
 const exponentText=exponent.toString();
 return sqlJoin([match![1]!,significant,'e',exponentText],accounting,path);
}
export function literalSql(value:CoreLiteral,accounting?:AccountingContext,path='/sql/literal'):string{
 if(value===null)return 'NULL';
 if('boolean'in value)return value.boolean?'TRUE':'FALSE';
 if('string'in value)return sqlJoin(['(',quoteText(value.string,accounting,path),'::pg_catalog.text COLLATE pg_catalog."C")'],accounting,path);
 if('integerToken'in value)return sqlJoin([quoteText(numericToken(value.integerToken,accounting,path),accounting,path),'::pg_catalog.numeric'],accounting,path);
 if('decimalToken'in value)return sqlJoin([quoteText(numericToken(value.decimalToken,accounting,path),accounting,path),'::pg_catalog.numeric'],accounting,path);
 if('uuid'in value)return sqlJoin([quoteText(value.uuid,accounting,path),'::pg_catalog.uuid'],accounting,path);
 if('date'in value)return sqlJoin([quoteText(accounting?nativeDateCharged(value.date,accounting,path):nativeDate(value.date),accounting,path),'::pg_catalog.date'],accounting,path);
 if('timestamp'in value)return sqlJoin([quoteText(accounting?nativeInstantCharged(value.timestamp,accounting,path):nativeInstant(value.timestamp),accounting,path),'::pg_catalog.timestamptz'],accounting,path);
 if('binaryHex'in value)return sqlJoin(["pg_catalog.decode(",quoteText(value.binaryHex,accounting,path),",'hex')"],accounting,path);
 if('bits128Hex'in value)return sqlJoin(["pg_catalog.decode(",quoteText(value.bits128Hex,accounting,path),",'hex')"],accounting,path);
 deploymentError('Literal carrier is not qualified for deployment expressions');
}
export function expressionSql(expr:TableExpression,table:TableDeclaration,ctx:DeploymentContext):string{
 const accounting=ctx.accounting,path=ctx.path+'/expression';
 if(expr.op==='field')return quoteIdentifier(ctx.column(table,expr.field),accounting,path);
 if(expr.op==='literal')return literalSql(expr.value,accounting,path);
 if(expr.op==='and'||expr.op==='or'){const parts=['('];for(let i=0;i<expr.args.length;i++){accounting?.visit('sql-expression-argument',path);if(i)parts.push(expr.op==='and'?' AND ':' OR ');parts.push(expressionSql(expr.args[i]!,table,ctx));}parts.push(')');return sqlJoin(parts,accounting,path);}
 if(expr.op==='not')return sqlJoin(['(NOT ',expressionSql(expr.arg,table,ctx),')'],accounting,path);
 if(expr.op==='isNull')return sqlJoin(['(',expressionSql(expr.arg,table,ctx),' IS NULL)'],accounting,path);
 if(expr.op==='in'){const parts=['(',expressionSql(expr.arg,table,ctx),' IN ('];for(let i=0;i<expr.values.length;i++){accounting?.visit('sql-expression-value',path);if(i)parts.push(', ');parts.push(literalSql(expr.values[i]!,accounting,path));}parts.push('))');return sqlJoin(parts,accounting,path);}
 const operators={eq:'=',ne:'<>',lt:'<',le:'<=',gt:'>',ge:'>='};
 if('left'in expr)return sqlJoin(['(',expressionSql(expr.left,table,ctx),' ',operators[expr.op],' ',expressionSql(expr.right,table,ctx),')'],accounting,path);
 return deploymentError('Unknown check expression');
}
