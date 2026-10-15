/** @covers US-079-AC7 @covers US-079-AC10 */
import {test,expect} from 'bun:test';
import {CandidateSecurityOperationBudget} from '../../src/extensions/security/operation-budget-candidate';
import {evaluateCandidateCatalogAction,evaluateCandidateCatalogActionWithinOperation} from '../../src/extensions/security/catalog-runtime-candidate';
import {catalogRuntimeFixture,compileRuntimeFixture} from './catalog-runtime-fixture';
test('multiple write-style action checks share one step allowance across both states',()=>{
 const f=catalogRuntimeFixture(),program=compileRuntimeFixture(f);f.cut.maxSteps=2000;
 const proposed=structuredClone(f.cut);proposed.facts.find((r:any)=>r.type.elementId==='Resource').fields.find((p:any)=>p.field.elementId==='salary').value={integerToken:'200'};
 expect(evaluateCandidateCatalogAction(program,f.owner,f.cut,f.request).status).toBe('evaluated');expect(evaluateCandidateCatalogAction(program,f.owner,proposed,f.request).status).toBe('evaluated');
 const operation=new CandidateSecurityOperationBudget(2000),statuses=Array.from({length:8},(_,i)=>evaluateCandidateCatalogActionWithinOperation(program,f.owner,i%2?proposed:f.cut,f.request,operation).status);expect(statuses[0]).toBe('evaluated');expect(statuses).toContain('refused');expect(()=>operation.constrain(1000000)).toThrow();expect(evaluateCandidateCatalogActionWithinOperation(program,f.owner,f.cut,f.request,operation)).toMatchObject({status:'refused',rows:[]});
});
test('comparison literal charges cannot be reset by subsequent action checks',()=>{
 const f=catalogRuntimeFixture(),program=compileRuntimeFixture(f),operation=new CandidateSecurityOperationBudget(100000);operation.literal.reserveText(99999);
 expect(evaluateCandidateCatalogActionWithinOperation(program,f.owner,f.cut,f.request,operation)).toMatchObject({status:'refused',rows:[]});expect(evaluateCandidateCatalogAction(program,f.owner,f.cut,f.request).rows[0]!.decision).toBe('permit');
});
test('snapshot text is cumulative across action calls rather than independently admitted per state',()=>{
 const f=catalogRuntimeFixture(),program=compileRuntimeFixture(f);f.owner.id='o'.repeat(600000);f.cut.owner.id=f.owner.id;f.cut.maxSteps=1000000;const operation=new CandidateSecurityOperationBudget(1000000);
 expect(evaluateCandidateCatalogAction(program,f.owner,f.cut,f.request).status).toBe('evaluated');const result=Array.from({length:4},()=>evaluateCandidateCatalogActionWithinOperation(program,f.owner,f.cut,f.request,operation));expect(result[0]!.status).toBe('evaluated');expect(result.at(-1)).toMatchObject({status:'refused',rows:[]});
});
test('invalid operation accounting and cap increases cannot manufacture a fresh allowance',()=>{
 for(const limit of [0,-1,1.5,1000001,NaN])expect(()=>new CandidateSecurityOperationBudget(limit)).toThrow();const operation=new CandidateSecurityOperationBudget(4);operation.step(3);operation.constrain(100);expect(()=>operation.step(2)).toThrow();for(const charge of [-1,0.5,NaN])expect(()=>operation.snapshotText(charge)).toThrow();
});
