import {test,expect} from 'bun:test';
import {inspectHandlerState,inspectionFailure} from '../../scripts/actions-reference/sandbox-state';
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
