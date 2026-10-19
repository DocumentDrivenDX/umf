import {CURRENT_CORE_VERSION} from '../../src/model/types';
import {recordTypeCases} from './record-type-cases';
import type {Document} from '../../src/model/types';
export function nullabilityFieldOperationsCases(){
 return recordTypeCases().flatMap(row=>['required','absent-allowed','unspecified'].map(nullability=>{
  const source=structuredClone(row.source);source.umf=CURRENT_CORE_VERSION satisfies Document['umf'];source.modules[0]!.elements[1]!.nullability=nullability;
  return {source,field:row.fieldAuthor.identity,record:row.recordAuthor.identity,variant:row.variant};
 }));
}
