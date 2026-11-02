// SPDX-License-Identifier: MIT OR Apache-2.0
/** Finite host-only diagnostics; these events never cross the handler protocol. */
export const referenceHandlerTimingStages=['attempt-entered','owner-acquire-start','owner-acquire-complete','execution-deadline-start','container-create-dispatched','container-create-acknowledged','container-start-dispatched','protocol-ready','handler-result-received','execution-timeout','cleanup-started','cleanup-confirmed','cleanup-unconfirmed'] as const;
export type ReferenceHandlerTimingStage=typeof referenceHandlerTimingStages[number];
export type ReferenceHandlerTimingObservation=Readonly<{stage:ReferenceHandlerTimingStage;elapsedMs:number}>;
export type ReferenceHandlerTimingObserver=(observation:ReferenceHandlerTimingObservation)=>void;
/** Observer failures are ignored so diagnostics cannot alter handler execution. */
export function createReferenceHandlerTimingEmitter(observer?:ReferenceHandlerTimingObserver):((stage:ReferenceHandlerTimingStage)=>void){
 const started=performance.now();
 return stage=>{if(!observer)return;try{observer(Object.freeze({stage,elapsedMs:Math.max(0,Math.round(performance.now()-started))}));}catch{/* Diagnostics are best-effort. */}};
}
