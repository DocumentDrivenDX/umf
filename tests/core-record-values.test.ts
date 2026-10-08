import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {validateCoreRecordValues,readDocument,upgradeSchemaPropertiesEnvelope} from '../src/index';
const old=readDocument(readFileSync(new URL('../fixtures/core/record-values-source.umf.json',import.meta.url),'utf8'),'json');
const source=upgradeSchemaPropertiesEnvelope(old).target;
const identity={module:'fixture',element:'item'},label={module:'fixture',element:'label'},caption={module:'fixture',element:'caption'};
const labelValue={field:label,state:'present' as const,value:{string:'雪🙂'}};
test('complete logical record check preserves original incomplete document diagnostics',()=>{
 const original=JSON.stringify(source);const result=validateCoreRecordValues(source,identity,[labelValue]);
 expect(result.validation).toEqual({valid:true,complete:true,diagnostics:[]});
 expect(result.documentValidation.complete).toBe(false);expect(result.documentValidation.diagnostics.length).toBeGreaterThan(0);
 expect(result.fields.map(f=>f.state)).toEqual(['present','absent']);
 result.source.id='changed';expect(JSON.stringify(source)).toBe(original);
 expect(validateCoreRecordValues(source,identity,[labelValue,{field:caption,state:'present',value:null}]).validation.complete).toBe(true);
});
test('required absence/defaults, wrong values and duplicate/undeclared fields do not pass',()=>{
 const defaulted=structuredClone(source);defaulted.modules[0].elements[1].default={value:{string:'not inserted'},on:'missing'};
 for(const values of [[],[{field:label,state:'absent'}],[{field:label,state:'present',value:null}],[{field:label,state:'present',value:{integerToken:'9007199254740993123'}}],[labelValue,labelValue],[labelValue,{field:{module:'fixture',element:'unregistered'},state:'present',value:{string:'x'}}]] as any[]){
  const result=validateCoreRecordValues(defaulted,identity,values);expect(result.validation.valid).toBe(false);expect(result.validation.complete).toBe(false);
 }
});
test('unknown scope/availability and dataset keys remain explicit incomplete obligations',()=>{
 const unknown=structuredClone(source);unknown['x-future-assertion']={meaning:'retained'};
 const first=validateCoreRecordValues(unknown,identity,[labelValue]);expect(first.validation.valid).toBe(true);expect(first.validation.complete).toBe(false);expect(first.source['x-future-assertion']).toEqual({meaning:'retained'});
 const availability=structuredClone(source);availability.modules[0].elements[2].nullability='future';
 expect(validateCoreRecordValues(availability,identity,[labelValue]).validation.diagnostics.some(d=>d.code==='RECORD_AVAILABILITY_UNKNOWN')).toBe(true);
 const keyed=structuredClone(source);keyed.modules[0].elements[0].keys=[{id:'item-key',name:'item-key',fields:[label]}];
 expect(validateCoreRecordValues(keyed,identity,[labelValue]).validation.diagnostics.some(d=>d.code==='RECORD_KEY_CONTEXT_REQUIRED')).toBe(true);
});
test('explicit version/shape/accessor boundaries refuse without getters or version rewrite',()=>{
 expect(()=>validateCoreRecordValues(old,identity,[labelValue])).toThrow();
 expect(()=>validateCoreRecordValues(source,identity,[null] as any)).toThrow();
 let calls=0;const value=Object.defineProperty({...labelValue},'value',{get(){calls++;return {string:'x'};}});
 expect(()=>validateCoreRecordValues(source,identity,[value])).toThrow();expect(calls).toBe(0);
 expect(()=>validateCoreRecordValues(source,identity,[{...labelValue,unknown:true}] as any)).toThrow();
});
