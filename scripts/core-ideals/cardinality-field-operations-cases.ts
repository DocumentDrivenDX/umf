import {CURRENT_CORE_VERSION} from '../../src/model/types';
import {nullabilityFieldOperationsCases} from './nullability-field-operations-cases';
export function cardinalityFieldOperationsCases(){
 const previous=nullabilityFieldOperationsCases();
 return [...previous,...previous.flatMap(row=>[undefined,'one','unspecified'].map(cardinality=>{
  const source=structuredClone(row.source);source.umf=CURRENT_CORE_VERSION;if(cardinality!==undefined)source.modules[0]!.elements[1]!.cardinality=cardinality;
  return {...row,source};
 }))];
}
