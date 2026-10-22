// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {validateDocument} from '../../src/validation/document';
import {createValidator} from '../../src/validation/schema';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import schema from '../../spec/core/schema.json';
import {keyCases,keyCandidate} from '../../scripts/core-key-cases';

test('current document validation checks Key membership, primary/alternate identities and component equality',()=>{
 const rows=keyCases();expect(rows.length).toBeGreaterThan(50);
 for(const row of rows){
  const before=copyJson(row.document),result=validateDocument(row.document);
  expect(result.valid,row.id).toBe(row.valid);expect(copyJson(row.document)).toEqual(before);
   // These cases now enter through validateDocument; the retired candidate helper used KEY_STRUCTURE.
   if(row.code)expect(result.diagnostics.some(d=>d.code===row.code),row.id).toBe(true);
  for(const format of ['json','yaml'] as const){
   const recovered=readJsonValue(writeJsonValue(row.document,format),format);
   expect(recovered).toEqual(before);expect(validateDocument(recovered)).toEqual(result);
  }
 }
});
test('current key schema leaves cross-reference semantics to validator',()=>{
 const check=createValidator().compile(schema),d=keyCandidate();d.modules[0].elements[0].keys[1].id='pk';
 expect(check(d)).toBe(true);expect(validateDocument(d).valid).toBe(false);
 expect(validateDocument(keyCandidate()).valid).toBe(true);
});
test('key candidate never invokes getters and retains path-qualified unknowns',()=>{
 let invoked=false;const d=keyCandidate();Object.defineProperty(d.modules[0].elements[0],'keys',{enumerable:true,get(){invoked=true;return [];}});
 expect(validateDocument(d).valid).toBe(false);expect(invoked).toBe(false);
 const row=keyCases().find(r=>r.id==='unknown-qualifier')!;
 expect(validateDocument(row.document).diagnostics.some(d=>d.path.endsWith('/keys/0/a~1b~0c')&&d.severity==='warning')).toBe(true);
 const cycle=keyCandidate();cycle.modules[0].elements[0].unknown=cycle;
 expect(validateDocument(cycle).valid).toBe(false);
});
