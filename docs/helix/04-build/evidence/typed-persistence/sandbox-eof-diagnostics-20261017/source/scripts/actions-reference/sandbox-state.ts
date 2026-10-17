/** Trusted, bounded diagnostics only; no retries or changes to cleanup admission. */
export type CleanupInspectionPhase='initial'|'settlement';
export type CleanupInspectionReason=`${CleanupInspectionPhase}-${'timeout'|'command-failed'|'malformed'|'error'}`;
export type HandlerNativeState={ExitCode:number;OOMKilled:boolean;Running:boolean};
export function inspectHandlerState(phase:CleanupInspectionPhase,result:{exit:number;stdout:string}):{state:HandlerNativeState}|{reason:CleanupInspectionReason}{
 if(result.exit!==0)return {reason:`${phase}-command-failed`};
 try{const state:unknown=JSON.parse(result.stdout);if(!state||typeof state!=='object'||typeof (state as HandlerNativeState).ExitCode!=='number'||typeof (state as HandlerNativeState).OOMKilled!=='boolean'||typeof (state as HandlerNativeState).Running!=='boolean')return {reason:`${phase}-malformed`};const value=state as HandlerNativeState;return {state:{ExitCode:value.ExitCode,OOMKilled:value.OOMKilled,Running:value.Running}};}catch{return {reason:`${phase}-malformed`};}
}
export function inspectionFailure(phase:CleanupInspectionPhase,error:unknown):CleanupInspectionReason{
 return `${phase}-${error instanceof Error&&error.message==='Owned handler cleanup command timed out'?'timeout':'error'}`;
}
