import {test,expect} from 'bun:test';
import core from '../../spec/core/schema-properties-document.schema.json';
import actions from '../../spec/extensions/actions/schema.json';
import profileSchema from '../../spec/extensions/actions/executor-profile.schema.json';
import inspectionSchema from '../../spec/extensions/actions/inspection.schema.json';
import assessmentSchema from '../../spec/extensions/actions/assessment.schema.json';
import fixture from '../../fixtures/actions/approve.json';
import {createValidator} from '../../src/validation/schema';
import {inspectActions,assessAction,registerActions,type ActionExecutorProfile} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import type {Document} from '../../src/model/types';
const validator=createValidator();for(const schema of [core,actions,profileSchema,inspectionSchema,assessmentSchema])validator.addSchema(schema);
const checkProfile=validator.getSchema(profileSchema.$id)!,checkInspection=validator.getSchema(inspectionSchema.$id)!,checkAssessment=validator.getSchema(assessmentSchema.$id)!;
test('@covers US-078-AC5: actual reports satisfy published exact report/profile schemas',()=>{
 const source=structuredClone(fixture) as unknown as Document,r=registerActions(new Registry()),inspection=inspectActions(source,r),identity={module:'sales',action:'approve'};
 const profile:ActionExecutorProfile={id:'declaration',version:'1',coreVersion:'0.8.0',actionVersion:'0.1.0',source,identity,claims:inspection.actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['inert://declaration']}))};
 const assessment=assessAction(source,identity,profile,r);expect(checkProfile(profile)).toBe(true);expect(checkInspection(inspection)).toBe(true);expect(checkAssessment(assessment)).toBe(true);
 for(const mutate of [(p:any)=>p.coreVersion='0.7.0',(p:any)=>p.identity.document='external',(p:any)=>p.claims[0].evidence=[''],(p:any)=>p.claims[0].status='certified']){const invalid=structuredClone(profile);mutate(invalid);expect(checkProfile(invalid)).toBe(false);expect(()=>assessAction(source,identity,invalid,r)).toThrow();}
 for(const mutate of [(a:any)=>a.executionVerified=true,(a:any)=>a.outcomes[0].status='checked',(a:any)=>delete a.source,(a:any)=>a.identity.extra=true]){const invalid=structuredClone(assessment);mutate(invalid);expect(checkAssessment(invalid)).toBe(false);}
 const invalid=structuredClone(inspection);(invalid.actions[0]!.obligations[0] as any).status='certified';expect(checkInspection(invalid)).toBe(false);
});
