// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {relationshipCandidate,relationshipCases} from '../../scripts/core-relationship-cases';
import {validateRelationshipCandidate} from '../../src/validation/relationships';
import {validateDocument} from '../../src/validation/document';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';

// @covers US-045-AC1 @covers US-045-AC2 (candidate validation only; projection matrix covers AC8)
test('relationship candidate resolves keyed endpoints, participation, lifecycle and reified identity',()=>{
 const cases=relationshipCases();expect(cases.length).toBeGreaterThan(30);
 for(const row of cases){
  const before=structuredClone(row.document),r=validateRelationshipCandidate(row.document);
  expect(r.valid,row.id).toBe(row.valid);expect(row.document).toEqual(before);
  if(row.code)expect(r.diagnostics.some(d=>d.code===row.code),row.id).toBe(true);
  for(const format of ['json','yaml'] as const){const recovered=readJsonValue(writeJsonValue(row.document,format),format);expect(recovered).toEqual(before);expect(validateRelationshipCandidate(recovered)).toEqual(r);}
 }
});
// @covers US-045-AC3 (unknown extension content remains opaque)
test('relationship-shaped extension members remain opaque and candidate does not infer associations',()=>{
 const d=relationshipCandidate();d.modules[0].relationships=[];d.modules[0].extensions={};
 d.modules[0].extensions.future={relationships:{opaque:['not an assertion']}};
 d.modules[0].elements[0].references=[{role:'relationship',module:'m',element:'Customer'}];
 expect(validateDocument(d).valid).toBe(true);
 expect(validateRelationshipCandidate(d).valid).toBe(true);
 expect(d.modules[0].relationships).toEqual([]);
 const retired=relationshipCandidate();retired.umf='0.7.0';
 expect(validateRelationshipCandidate(retired).valid).toBe(false);
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
