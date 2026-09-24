import {test,expect} from 'bun:test';
import {relationshipCandidate,relationshipCases} from '../../scripts/core-relationship-cases';
import {validateRelationshipCandidate} from '../../src/validation/relationships';
import {validateDocument} from '../../src/validation/document';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';

// @covers US-045-AC1 US-045-AC2 US-045-AC8 (candidate validation only)
test('relationship candidate resolves keyed endpoints, participation, lifecycle and reified identity',()=>{
 const cases=relationshipCases();expect(cases.length).toBeGreaterThan(30);
 for(const row of cases){
  const before=structuredClone(row.document),r=validateRelationshipCandidate(row.document);
  expect(r.valid,row.id).toBe(row.valid);expect(row.document).toEqual(before);
  if(row.code)expect(r.diagnostics.some(d=>d.code===row.code),row.id).toBe(true);
  for(const format of ['json','yaml'] as const){const recovered=readJsonValue(writeJsonValue(row.document,format),format);expect(recovered).toEqual(before);expect(validateRelationshipCandidate(recovered)).toEqual(r);}
 }
});
// @covers US-045-AC3 US-045-AC10 (legacy interpretation only; migration is separate)
test('old relationship-shaped unknown members remain opaque and candidate does not infer associations',()=>{
 const d=relationshipCandidate();d.umf='0.6.0';d.modules[0].relationships={opaque:['not an assertion']};
 expect(validateDocument(d).valid).toBe(true);
 expect(validateRelationshipCandidate(d).valid).toBe(false);
 delete d.modules[0].relationships;d.umf='0.7.0';d.modules[0].elements[0].references=[{role:'relationship',module:'m',element:'Customer'}];
 expect(validateRelationshipCandidate(d).valid).toBe(true);expect(d.modules[0].relationships).toBeUndefined();
});
test('candidate retains unknown meanings and rejects accessors and cyclic input without evaluation',()=>{
 const future=relationshipCases().find(r=>r.id==='future-qualifiers')!;
 expect(validateRelationshipCandidate(future.document).diagnostics.some(d=>d.path.endsWith('/a~1b~0c'))).toBe(true);
 const lifecycle=relationshipCases().find(r=>r.id==='future-lifecycle')!;
 const result=validateRelationshipCandidate(lifecycle.document);expect(result.valid).toBe(true);expect(result.complete).toBe(false);
 let calls=0;const d=relationshipCandidate();Object.defineProperty(d.modules[0],'relationships',{enumerable:true,get(){calls++;return [];}});
 expect(validateRelationshipCandidate(d).valid).toBe(false);expect(calls).toBe(0);
 const oversized=relationshipCandidate();oversized.modules[0].relationships[0].targetMultiplicity.max=Number.MAX_SAFE_INTEGER+1;
 expect(validateRelationshipCandidate(oversized).diagnostics[0]!.code).toBe('NUMBER');
 const cyclic=relationshipCandidate();cyclic.unknown=cyclic;expect(validateRelationshipCandidate(cyclic).valid).toBe(false);
});
