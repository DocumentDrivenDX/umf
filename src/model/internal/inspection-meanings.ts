import type {CoreKeyDefinition} from '../../validation/keys';
import {copyJson} from '../json';
import type {Document,Element,Json,Validation} from '../types';
import type {CoreKeyMeaning} from '../keys';
import type {CoreFacetMeaning,CoreFacets,CoreFacetInterpreted} from '../facets';
import {validateFacetElement} from '../../validation/facets';
import {schemaPropertyNames} from '../schema-literals';
export interface InspectionElement {source:Document;element:Element;path:string;validation:Validation}
const unknown=(diagnostics:Validation['diagnostics'],path:string)=>diagnostics.filter(d=>d.code==='UNKNOWN_KEY_QUALIFIER'&&(d.path===path||d.path.startsWith(path+'/'))).map(d=>d.path);
export function keyMeaning(l:InspectionElement):CoreKeyMeaning {
 const path=l.path+'/keys';let meaning:CoreKeyMeaning={state:'missing'};
 if(Object.hasOwn(l.element,'keys')){
  if(l.source.umf!=='0.6.0'&&l.source.umf!=='0.7.0'&&l.source.umf!=='0.8.0'&&l.source.umf!=='0.9.0')meaning={state:'legacy',value:copyJson(l.element.keys)};
  else{const uninterpretedPaths=unknown(l.validation.diagnostics,path);meaning={state:uninterpretedPaths.length?'partial':'known',keys:copyJson(l.element.keys) as unknown as CoreKeyDefinition[],uninterpretedPaths};}
 }else if((l.source.umf==='0.6.0'||l.source.umf==='0.7.0'||(l.source.umf==='0.8.0'||l.source.umf==='0.9.0'))&&l.element.kind!=='record')meaning={state:'inapplicable'};
 return meaning;
}
export function facetMeaning(located:InspectionElement):CoreFacetMeaning {
 const {source,element}=located,path=located.path+'/facets';let meaning:CoreFacetMeaning={state:'missing'};
 if(Object.hasOwn(element,'facets')){
  if(source.umf!=='0.5.0'&&source.umf!=='0.6.0'&&source.umf!=='0.7.0'&&source.umf!=='0.8.0'&&source.umf!=='0.9.0')meaning={state:'legacy',value:copyJson(element.facets)};
  else{
   const value=copyJson(element.facets) as unknown as CoreFacets,interpreted:CoreFacetInterpreted={};
   if(value.length&&(value.length.unit==='unicode-scalar'||value.length.unit==='byte'))interpreted.length={...(value.length.max!==undefined?{max:value.length.max}:{}),...((source.umf==='0.8.0'||source.umf==='0.9.0')&&value.length.min!==undefined?{min:value.length.min}:{}),unit:value.length.unit};
   if(value.integerWidth)interpreted.integerWidth={bits:value.integerWidth.bits,signed:value.integerWidth.signed};
   if(value.precision!==undefined){interpreted.precision=value.precision;interpreted.scale=value.scale!;}
   if(source.umf==='0.8.0'||source.umf==='0.9.0'){
    for(const group of ['collectionSize','range'] as const){
     const raw=value[group] as Record<string,Json>|undefined;if(!raw)continue;
     const selected:Record<string,Json>={};
     for(const key of group==='range'?['min','max','minInclusive','maxInclusive']:['min','max'])if(Object.hasOwn(raw,key))selected[key]=copyJson(raw[key]!);
     Object.assign(interpreted,{[group]:selected});
    }
   }
   const uninterpretedPaths=((source.umf==='0.8.0'||source.umf==='0.9.0')?located.validation.diagnostics.filter(d=>d.path.startsWith(path+'/')):validateFacetElement(element,path.slice(0,-7)).diagnostics).filter(d=>d.severity==='warning').map(d=>d.path);
   meaning={state:uninterpretedPaths.length?'partial':'known',facets:value,interpreted,uninterpretedPaths};
  }
 }else if((source.umf==='0.5.0'||(source.umf==='0.6.0'||source.umf==='0.7.0'||(source.umf==='0.8.0'||source.umf==='0.9.0')))&&element.kind!=='field')meaning={state:'inapplicable'};
 return meaning;
}
export function schemaProperties(node:Record<string,unknown>):Record<string,Json> {
 const properties:Record<string,Json>=Object.create(null);
 for(const key of [...schemaPropertyNames,'facets'])if(Object.hasOwn(node,key))properties[key]=copyJson(node[key]);
 return properties;
}
