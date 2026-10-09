import {copyJson} from '../json';
import {type Document,type Element,UmfError,type Validation} from '../types';
import {type CoreLiteral,knownSchemaMembers,schemaError,checkSchemaLiteral} from '../schema-literals';
import {checkCoreLiteral} from '../../validation/schema-properties';
export function evaluateFieldValue(fieldInput:{module:string;element:string},valueInput:CoreLiteral,locateField:(field:{module:string;element:string})=>{source:Document;node:unknown},copy:typeof copyJson=copyJson,checkLiteral:typeof checkSchemaLiteral=checkSchemaLiteral,reserveLiteral?:(value:CoreLiteral)=>void):Validation {
 const diagnostics:Validation['diagnostics']=[];
 try{
  const field=copy(fieldInput) as unknown as {module:string;element:string};
  const value=copy(valueInput) as unknown as CoreLiteral;
  reserveLiteral?.(value);
  if(!checkCoreLiteral(value))schemaError('Invalid typed literal');
  knownSchemaMembers(field,['module','element'],'/identity');
  const located=locateField(field);checkLiteral(located.source,located.node as unknown as Element,value);
 }catch(error){if(!(error instanceof UmfError))throw error;diagnostics.push({code:error.code,path:error.path,message:error.message,severity:'error'});}
 return {valid:diagnostics.length===0,complete:diagnostics.length===0,diagnostics};
}