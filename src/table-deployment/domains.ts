// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Element} from '../model/types';
import type {TableColumn} from '../extensions/tables';
import {deploymentError} from './configuration';
import {literalSql,quoteIdentifier as q} from './sql';

/** Native CHECKs preserve source domains; NULL is governed independently. */
export function domainPredicates(column:TableColumn,field:Element):string[]{
 const name=q(column.name),kind=column.nativeType.kind,facets=field.facets??{},parts:string[]=[];
 if(kind==='numeric')parts.push(`${name} NOT IN ('NaN'::pg_catalog.numeric, 'Infinity'::pg_catalog.numeric, '-Infinity'::pg_catalog.numeric)`);
 if(kind==='date')parts.push(`${name} >= '0001-01-01'::pg_catalog.date AND ${name} <= '9999-12-31'::pg_catalog.date`);
 if(kind==='timestamptz')parts.push(`${name} >= '0001-01-01T00:00:00Z'::pg_catalog.timestamptz AND ${name} <= '9999-12-31T23:59:59.999999Z'::pg_catalog.timestamptz`);
 if(Object.keys(facets).some(k=>!['precision','scale','integerWidth','range','length'].includes(k)))deploymentError('Logical facet requires a qualified native constraint');
 for(const [group,keys] of [['length',['min','max','unit']],['range',['min','max','minInclusive','maxInclusive']],['integerWidth',['bits','signed']]] as const){
  const value=facets[group];if(value&&Object.keys(value).some(k=>!(keys as readonly string[]).includes(k)))deploymentError('Unknown logical domain qualifier');
 }
 if(facets.length){
  if(!(['string','binary'].includes(field.scalarType??''))||facets.length.unit!==(field.scalarType==='string'?'unicode-scalar':'byte'))deploymentError('Native length unit differs from logical domain');
  const length=`pg_catalog.${field.scalarType==='string'?'char_length':'octet_length'}(${name})`;
  if(facets.length.min!==undefined)parts.push(`${length} >= ${facets.length.min}`);
  if(facets.length.max!==undefined)parts.push(`${length} <= ${facets.length.max}`);
 }
 if(facets.integerWidth){
  if(field.scalarType!=='integer')deploymentError('Native integer width requires integer storage');
  const {bits,signed}=facets.integerWidth;
  // Native signed widths already bound larger logical widths. Preserve unsignedness.
  const nativeBits=kind==='int2'?16:kind==='int4'?32:64;
  if(bits<nativeBits){const lower=signed?-(1n<<BigInt(bits-1)):0n,upper=(1n<<BigInt(signed?bits-1:bits))-1n;parts.push(`${name} >= ${lower} AND ${name} <= ${upper}`);}
  else if(!signed)parts.push(`${name} >= 0`);
 }
 if(facets.range){
  if(!['integer','decimal'].includes(field.scalarType??''))deploymentError('Native range requires exact numeric storage');
  const range=facets.range;
  if(range.min!==undefined)parts.push(`${name} ${range.minInclusive===false?'>':'>='} ${literalSql(range.min)}`);
  if(range.max!==undefined)parts.push(`${name} ${range.maxInclusive===false?'<':'<='} ${literalSql(range.max)}`);
 }
 if(field.allowedValues?.length){
  if(!['string','boolean','integer','decimal'].includes(field.scalarType??''))deploymentError('Native enumeration carrier is not qualified');
  const values=field.allowedValues.filter(v=>v!==null);
  parts.push(values.length?`${name} IN (${values.map(literalSql).join(', ')})`:`${name} IS NULL`);
 }
 return parts;
}
