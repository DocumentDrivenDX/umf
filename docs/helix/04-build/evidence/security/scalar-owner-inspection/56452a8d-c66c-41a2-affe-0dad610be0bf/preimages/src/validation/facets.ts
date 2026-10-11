import schema from '../../spec/core/facet-document.schema.json';
import {createValidator} from './schema';
import {copyJson} from '../model/json';
import {UmfError,pointer,type JsonObject,type Validation,type Diagnostic} from '../model/types';
const check=createValidator().compile({$defs:schema.$defs,$ref:'#/$defs/element'});
/** Internal candidate-0.5.0 element validation, not document/profile migration or native enforcement. */
export function validateFacetElement(input:unknown,path=''):Validation {
 const diagnostics:Diagnostic[]=[];
 const add=(code:string,at:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path:path+at,message,severity});
 let element:JsonObject;
 try{element=copyJson(input) as JsonObject;}catch(error){if(!(error instanceof UmfError))throw error;add(error.code,error.path,error.message);return {valid:false,complete:false,diagnostics};}
 if(!check(element)){
  for(const error of check.errors??[])add('FACET_STRUCTURE',error.instancePath,error.message??'Invalid facet element');
  return {valid:false,complete:false,diagnostics};
 }
 if(Object.hasOwn(element,'facets')){
  const facets=element.facets as JsonObject;
  const unknown=(object:JsonObject,known:string[],at:string)=>{
   for(const key of Object.keys(object))if(!known.includes(key))add('UNKNOWN_FACET',at+'/'+pointer(key),'Facet member retained without interpretation','warning');
  };
  unknown(facets,['length','precision','scale','integerWidth'],'/facets');
  if(Object.hasOwn(facets,'precision')&&(facets.scale as number)>(facets.precision as number))add('FACET_SCALE','/facets/scale','Scale must not exceed precision');
  if(Object.hasOwn(facets,'length')){
   const length=facets.length as JsonObject;unknown(length,['max','unit'],'/facets/length');
   if(length.unit!=='unicode-scalar'&&length.unit!=='byte')add('UNKNOWN_FACET_UNIT','/facets/length/unit','Length unit retained without interpretation','warning');
  }
  if(Object.hasOwn(facets,'integerWidth'))unknown(facets.integerWidth as JsonObject,['bits','signed'],'/facets/integerWidth');
 }
 return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
