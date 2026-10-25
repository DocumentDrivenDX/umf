// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Element} from '../model/types';
import type {TableColumn} from '../extensions/tables';
import {deploymentError} from './configuration';
import {literalSql,quoteIdentifier as q} from './sql';
import type {AccountingContext} from '../model/internal/accounting-context';
import {sqlJoin} from './sql';

/** Native CHECKs preserve source domains; NULL is governed independently. */
export function domainPredicates(column:TableColumn,field:Element,accounting?:AccountingContext,path='/sql/domain'):string[]{
 const name=q(column.name,accounting,path),kind=column.nativeType.kind,facets=field.facets??{},parts:string[]=[];
 const retain=(chunks:readonly string[])=>{accounting?.visit('sql-domain-clause',path);parts.push(sqlJoin(chunks,accounting,path));};
 const hasUnknown=(value:object,allowed:readonly string[])=>{for(const key in value)if(Object.hasOwn(value,key)){accounting?.visit('sql-domain-qualifier-scan',path);if(!allowed.includes(key))return true;}return false;};
 if(kind==='numeric')retain([name," NOT IN ('NaN'::pg_catalog.numeric, 'Infinity'::pg_catalog.numeric, '-Infinity'::pg_catalog.numeric)"]);
 if(kind==='date')retain([name," >= '0001-01-01'::pg_catalog.date AND ",name," <= '9999-12-31'::pg_catalog.date"]);
 if(kind==='timestamptz')retain([name," >= '0001-01-01T00:00:00Z'::pg_catalog.timestamptz AND ",name," <= '9999-12-31T23:59:59.999999Z'::pg_catalog.timestamptz"]);
 if(hasUnknown(facets,['precision','scale','integerWidth','range','length']))deploymentError('Logical facet requires a qualified native constraint');
 for(const [group,keys] of [['length',['min','max','unit']],['range',['min','max','minInclusive','maxInclusive']],['integerWidth',['bits','signed']]] as const){
  const value=facets[group];if(value&&hasUnknown(value,keys))deploymentError('Unknown logical domain qualifier');
 }
 if(facets.length){
  if(!(['string','binary'].includes(field.scalarType??''))||facets.length.unit!==(field.scalarType==='string'?'unicode-scalar':'byte'))deploymentError('Native length unit differs from logical domain');
  const length=`pg_catalog.${field.scalarType==='string'?'char_length':'octet_length'}(${name})`;
  if(facets.length.min!==undefined){accounting?.visit('sql-domain-bound',path);retain([length,' >= ',String(facets.length.min)]);}
  if(facets.length.max!==undefined){accounting?.visit('sql-domain-bound',path);retain([length,' <= ',String(facets.length.max)]);}
 }
 if(facets.integerWidth){
  if(field.scalarType!=='integer')deploymentError('Native integer width requires integer storage');
  const {bits,signed}=facets.integerWidth;
  // Native signed widths already bound larger logical widths. Preserve unsignedness.
  const nativeBits=kind==='int2'?16:kind==='int4'?32:64;
  if(bits<nativeBits){accounting?.visit('sql-domain-integer-bound',path);const lower=signed?-(1n<<BigInt(bits-1)):0n,upper=(1n<<BigInt(signed?bits-1:bits))-1n;retain([name,' >= ',String(lower),' AND ',name,' <= ',String(upper)]);}
  else if(!signed)retain([name,' >= 0']);
 }
 if(facets.range){
  if(!['integer','decimal'].includes(field.scalarType??''))deploymentError('Native range requires exact numeric storage');
  const range=facets.range;
  if(range.min!==undefined)retain([name,' ',range.minInclusive===false?'>':'>=',' ',literalSql(range.min,accounting,path)]);
  if(range.max!==undefined)retain([name,' ',range.maxInclusive===false?'<':'<=',' ',literalSql(range.max,accounting,path)]);
 }
 if(field.allowedValues?.length){
  if(!['string','boolean','integer','decimal'].includes(field.scalarType??''))deploymentError('Native enumeration carrier is not qualified');
  const values:string[]=[];for(const [index,value] of field.allowedValues.entries()){accounting?.visit('sql-domain-value',path);if(value!==null)values.push(literalSql(value,accounting,`${path}/allowedValues/${index}`));}
  if(values.length){const chunks=[name,' IN ('];for(let i=0;i<values.length;i++){if(i)chunks.push(', ');chunks.push(values[i]!);}chunks.push(')');retain(chunks);}else retain([name,' IS NULL']);
 }
 return parts;
}
