/** Exact mixed-model scalar tokens. This module owns scalar lowering, not transport. */
import {UmfError,type Document,type Element} from '../../model/types';
import {validateCoreFieldValue} from '../../model/schema-properties';
import {schemaCoefficient,checkSchemaLiteral,type CoreLiteral} from '../../model/schema-literals';
export interface ScalarCarrier {kind:'scalar';column:string}
export const scalarWrapper:Record<string,string>={boolean:'boolean',integer:'integerToken',decimal:'decimalToken',string:'string',binary:'binaryHex',float:'floatToken',date:'date',time:'time',timestamp:'timestamp'};
export function checkModelScalar(field:Element):void {
 if(!scalarWrapper[field.scalarType!])throw new UmfError('MODEL_SCALAR','Scalar has no qualified exact value semantics');
 const facets=field.facets as Record<string,any>|undefined;
 if(field.scalarType==='decimal'&&(!Number.isSafeInteger(facets?.precision)||!Number.isSafeInteger(facets?.scale)||facets!.precision>38))throw new UmfError('MODEL_SCALAR','Decimal requires precision/scale within38 digits');
 if(field.scalarType==='integer'&&!facets?.integerWidth)throw new UmfError('MODEL_SCALAR','Integer needs explicit bounded width');
}
export function encodeModelScalar(source:Document,id:{module:string;element:string},field:Element,value:CoreLiteral):string|null {
 checkModelScalar(field);if(['float','date','time','timestamp'].includes(field.scalarType!)){checkSchemaLiteral(source,field,value,false);return value===null?null:String((value as unknown as Record<string,string>)[scalarWrapper[field.scalarType!]!]);}if(!validateCoreFieldValue(source,id,value).valid)throw new UmfError('MODEL_SCALAR_VALUE','Invalid scalar value');
 if(value===null)return null;
 const token=(value as unknown as Record<string,string|boolean>)[scalarWrapper[field.scalarType!]!]!;
 if(field.scalarType==='integer')return schemaCoefficient(String(token),0).toString();
 if(field.scalarType==='decimal'){
  const f=field.facets as {precision:number;scale:number},n=schemaCoefficient(String(token),f.scale,f.precision),negative=n<0n,digits=(negative?-n:n).toString().padStart(f.scale+1,'0');
  return (negative?'-':'')+(f.scale?digits.slice(0,-f.scale)+'.'+digits.slice(-f.scale):digits);
 }
 if(field.scalarType==='binary')return String(token).toLowerCase();
 return String(token);
}
export function decodeModelScalar(source:Document,id:{module:string;element:string},field:Element,token:string|null):CoreLiteral {
 if(token!==null&&typeof token!=='string')throw new UmfError('MODEL_SCALAR_VALUE','Exact scalar token required');
 if(field.scalarType==='boolean'&&token!==null&&!['true','false'].includes(token))throw new UmfError('MODEL_SCALAR_VALUE','Boolean token required');
 const value=token===null?null:{[scalarWrapper[field.scalarType!]!]:field.scalarType==='boolean'?token==='true':token} as CoreLiteral;
 encodeModelScalar(source,id,field,value);return value;
}
export function scalarSqlType(field:Element,pg:boolean):string {
 const f=field.facets as Record<string,any>|undefined;
 switch(field.scalarType){
  case 'boolean':return pg?'boolean':'bit';
  case 'integer':{const w=f!.integerWidth;return w.bits<=63||w.bits===64&&w.signed?'bigint':pg?'numeric(39,0)':'varchar(40) COLLATE Latin1_General_100_BIN2';}
  case 'decimal':return `decimal(${f!.precision},${f!.scale})`;
  case 'binary':return pg?'bytea':`varbinary(${f?.length?.max&&f.length.max<=8000?f.length.max:'max'})`;
  default:return pg?'text':`nvarchar(${f?.length?.max&&f.length.max<=2000?f.length.max*2:'max'}) COLLATE Latin1_General_100_BIN2`;
 }
}
