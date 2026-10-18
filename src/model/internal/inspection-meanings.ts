import type {CoreKeyDefinition} from '../../validation/keys';
import {copyJson} from '../json';
import type {Document,Element,Json,Validation} from '../types';
import type {CoreKeyMeaning} from '../keys';
import type {CoreFacetMeaning,CoreFacets,CoreFacetInterpreted} from '../facets';
import {schemaPropertyNames} from '../schema-literals';
export interface InspectionElement {source:Document;element:Element;path:string;validation:Validation}
const unknown=(diagnostics:Validation['diagnostics'],path:string)=>diagnostics.filter(d=>d.code==='UNKNOWN_KEY_QUALIFIER'&&(d.path===path||d.path.startsWith(path+'/'))).map(d=>d.path);
export function keyMeaning(l:InspectionElement):CoreKeyMeaning {
 const path=l.path+'/keys';let meaning:CoreKeyMeaning={state:'missing'};
 if(Object.hasOwn(l.element,'keys')){
  const uninterpretedPaths=unknown(l.validation.diagnostics,path);meaning={state:uninterpretedPaths.length?'partial':'known',keys:copyJson(l.element.keys) as unknown as CoreKeyDefinition[],uninterpretedPaths};
 }else if(l.element.kind!=='record')meaning={state:'inapplicable'};
 return meaning;
}
export function facetMeaning(located:InspectionElement):CoreFacetMeaning {
 const {element}=located,path=located.path+'/facets';let meaning:CoreFacetMeaning={state:'missing'};
 if(Object.hasOwn(element,'facets')){
  {
   const value=copyJson(element.facets) as unknown as CoreFacets,interpreted:CoreFacetInterpreted={};
   if(value.length&&(value.length.unit==='unicode-scalar'||value.length.unit==='byte'))interpreted.length={...(value.length.max!==undefined?{max:value.length.max}:{}),...(value.length.min!==undefined?{min:value.length.min}:{}),unit:value.length.unit};
   if(value.integerWidth)interpreted.integerWidth={bits:value.integerWidth.bits,signed:value.integerWidth.signed};
   if(value.precision!==undefined){interpreted.precision=value.precision;interpreted.scale=value.scale!;}
   {
    for(const group of ['collectionSize','range'] as const){
     const raw=value[group] as Record<string,Json>|undefined;if(!raw)continue;
     const selected:Record<string,Json>={};
     for(const key of group==='range'?['min','max','minInclusive','maxInclusive']:['min','max'])if(Object.hasOwn(raw,key))selected[key]=copyJson(raw[key]!);
     Object.assign(interpreted,{[group]:selected});
    }
   }
   const uninterpretedPaths=located.validation.diagnostics.filter(d=>d.path.startsWith(path+'/')&&d.severity==='warning').map(d=>d.path);
   meaning={state:uninterpretedPaths.length?'partial':'known',facets:value,interpreted,uninterpretedPaths};
  }
 }else if(element.kind!=='field')meaning={state:'inapplicable'};
 return meaning;
}
export function schemaProperties(node:Record<string,unknown>):Record<string,Json> {
 const properties:Record<string,Json>=Object.create(null);
 for(const key of [...schemaPropertyNames,'facets'])if(Object.hasOwn(node,key))properties[key]=copyJson(node[key]);
 return properties;
}
