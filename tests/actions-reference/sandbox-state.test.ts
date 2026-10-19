import {test,expect} from 'bun:test';
import {inspectHandlerState,inspectionFailure,armCleanupCommandTimeout,settlementInspectionFailure} from '../../scripts/actions-reference/sandbox-state';
test('cleanup diagnostic distinguishes initial and settlement native inspection failures',()=>{
 for(const phase of ['initial','settlement'] as const){
  expect(inspectionFailure(phase,Error('Owned handler cleanup command timed out'))).toBe(`${phase}-timeout`);
  expect(inspectionFailure(phase,Error('unexpected'))).toBe(`${phase}-error`);
  expect(inspectHandlerState(phase,{exit:1,stdout:'untrusted'})).toEqual({reason:`${phase}-command-failed`});
  for(const stdout of ['bad','{}','{"ExitCode":137,"OOMKilled":"false","Running":false}'])expect(inspectHandlerState(phase,{exit:0,stdout})).toEqual({reason:`${phase}-malformed`});
 }
});
test('native exit137 never becomes OOM without original Boolean evidence',()=>{
 expect(inspectHandlerState('initial',{exit:0,stdout:JSON.stringify({ExitCode:137,OOMKilled:false,Running:false,untrusted:'discard'})})).toEqual({state:{ExitCode:137,OOMKilled:false,Running:false}});
 expect(inspectHandlerState('settlement',{exit:0,stdout:JSON.stringify({ExitCode:137,OOMKilled:true,Running:false})})).toEqual({state:{ExitCode:137,OOMKilled:true,Running:false}});
});
test('rounded optional final-poll timer preserves validated non-OOM state before the clock deadline',()=>{
 const settleUntil=1000,startedAt=998.25,lastState={ExitCode:137,OOMKilled:false,Running:false};
 let now=startedAt,failure:unknown;
 armCleanupCommandTimeout(settleUntil-now,2000-now,true,error=>{failure=error;},(callback,delay)=>{
  // Reproduce timer rounding deterministically: 1.75ms fires after 1ms.
  expect(delay).toBe(1.75);now+=Math.floor(delay);callback();return 0 as unknown as ReturnType<typeof setTimeout>;
 });
 expect(now).toBeLessThan(settleUntil);
 expect(failure).toMatchObject({code:'LIMIT',budget:'settlement'});
 expect(settlementInspectionFailure(failure)).toBeUndefined();
 expect(inspectHandlerState('settlement',{exit:0,stdout:JSON.stringify(lastState)})).toEqual({state:lastState});
});
test('only the optional settlement budget may expire without an inspection diagnostic',()=>{
 const timeout=(maximum:number,remaining:number,optional:boolean)=>{
  let failure:unknown;
  armCleanupCommandTimeout(maximum,remaining,optional,error=>{failure=error;},(callback,delay)=>{expect(delay).toBe(Math.max(1,Math.min(maximum,remaining)));callback();return 0 as unknown as ReturnType<typeof setTimeout>;});
  return failure;
 };
 // Initial inspection, removal and absence commands retain mandatory timeouts.
 for(const maximum of [500,2000]){
  const failure=timeout(maximum,2000,false);
  expect(inspectionFailure('initial',failure)).toBe('initial-timeout');
  expect(settlementInspectionFailure(failure)).toBe('settlement-timeout');
 }
 // Even an optional poll cannot ignore expiration of the overall cleanup budget.
 expect(settlementInspectionFailure(timeout(500,100,true))).toBe('settlement-timeout');
 // Message/code lookalikes and other inspection failures are not optional.
 expect(settlementInspectionFailure(Object.assign(Error('Owned handler cleanup command timed out'),{code:'LIMIT',budget:'settlement'}))).toBe('settlement-timeout');
 expect(settlementInspectionFailure(Error('unexpected'))).toBe('settlement-error');
 expect(inspectHandlerState('settlement',{exit:1,stdout:''})).toEqual({reason:'settlement-command-failed'});
 expect(inspectHandlerState('settlement',{exit:0,stdout:'{}'})).toEqual({reason:'settlement-malformed'});
});
