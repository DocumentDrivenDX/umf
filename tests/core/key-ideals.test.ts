import {test,expect} from 'bun:test';
import {validateKeyCandidate} from '../../src/validation/keys';
import {validateDocument} from '../../src/validation/document';
import {createValidator} from '../../src/validation/schema';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import schema from '../../spec/core/key-document.schema.json';
import {keyCases,keyCandidate} from '../../scripts/core-key-cases';

test('candidate Key checks membership, primary/alternate identities and component equality',()=>{
 const rows=keyCases();expect(rows.length).toBeGreaterThan(50);
 for(const row of rows){
  const before=copyJson(row.document),result=validateKeyCandidate(row.document);
  expect(result.valid,row.id).toBe(row.valid);expect(copyJson(row.document)).toEqual(before);
  if(row.code)expect(result.diagnostics.some(d=>d.code===row.code),row.id).toBe(true);
  for(const format of ['json','yaml'] as const){
   const recovered=readJsonValue(writeJsonValue(row.document,format),format);
   expect(recovered).toEqual(before);expect(validateKeyCandidate(recovered)).toEqual(result);
  }
 }
});
test('key schema leaves cross-reference semantics to validator; old profiles stay opaque',()=>{
 const check=createValidator().compile(schema),d=keyCandidate();d.modules[0].elements[0].keys[1].id='pk';
 expect(check(d)).toBe(true);expect(validateKeyCandidate(d).valid).toBe(false);
 expect(validateDocument(keyCandidate()).valid).toBe(true); // Explicit 0.6.0 public support now validates the same semantics.
 d.umf='0.5.0';d.modules[0].elements[0].keys={opaque:null};d.modules[0].elements[0].members=false;
 expect(validateDocument(d).valid).toBe(true);
 expect(validateDocument(d).diagnostics.some(d=>d.code==='UNKNOWN_CORE_FIELD'&&d.path.endsWith('/keys'))).toBe(true);
});
test('key candidate never invokes getters and retains path-qualified unknowns',()=>{
 let invoked=false;const d=keyCandidate();Object.defineProperty(d.modules[0].elements[0],'keys',{enumerable:true,get(){invoked=true;return [];}});
 expect(validateKeyCandidate(d).valid).toBe(false);expect(invoked).toBe(false);
 const row=keyCases().find(r=>r.id==='unknown-qualifier')!;
 expect(validateKeyCandidate(row.document).diagnostics.some(d=>d.path.endsWith('/keys/0/a~1b~0c')&&d.severity==='warning')).toBe(true);
 const cycle=keyCandidate();cycle.modules[0].elements[0].unknown=cycle;
 expect(validateKeyCandidate(cycle).valid).toBe(false);
});
