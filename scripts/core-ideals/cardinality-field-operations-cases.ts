import {nullabilityFieldOperationsCases} from './nullability-field-operations-cases';
export function cardinalityFieldOperationsCases(){
 const previous=nullabilityFieldOperationsCases();
 return [...previous,...previous.filter(r=>r.source.umf==='0.3.0').flatMap(row=>[undefined,'one','unspecified'].map(cardinality=>{
  const source=structuredClone(row.source);source.umf='0.4.0';if(cardinality!==undefined)source.modules[0]!.elements[1]!.cardinality=cardinality;
  return {...row,source};
 }))];
}
