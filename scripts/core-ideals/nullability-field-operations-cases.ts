import {recordTypeCases} from './record-type-cases';
import type {Document} from '../../src/model/types';
export function nullabilityFieldOperationsCases(){
 return recordTypeCases().flatMap(row=>['0.2.0','0.3.0'].flatMap(umf=>['required','absent-allowed','unspecified'].map(nullability=>{
  const source=structuredClone(row.source);source.umf=umf as Document['umf'];source.modules[0]!.elements[1]!.nullability=nullability;
  return {source,field:row.fieldAuthor.identity,record:row.recordAuthor.identity,variant:row.variant};
 })));
}
