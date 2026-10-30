# Protocol counterexamples and reachability traces

These action sequences are extracted from the retained original TLC traces.
A named invariant violation is expected for each mutant or negative witness.
Compressed logs retain every original state and diagnostic.

## mutant-failed-reinvoke

Expected violation: `NoncommitHasNoEffect`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Redeliver`

## mutant-resume

Expected violation: `NoAutomaticResume`.

`Initial predicate` → `Submit` → `Next` → `Next` → `Resume`

## mutant-changed-intent

Expected violation: `IntentPinned`.

`Initial predicate` → `Submit` → `Resubmit`

## mutant-unknown-advance

Expected violation: `ForwardOrdered`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Worker`

## mutant-duplicate-effect

Expected violation: `NoDuplicateEffects`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Redeliver`

## mutant-rollback-running

Expected violation: `FailureStartsUnwind`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist`

## mutant-late-cancel

Expected violation: `CancelledCause`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Next` → `Finish`

## mutant-skip-barrier

Expected violation: `NoFalseRestoration`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Next` → `Disposition` → `Finish`

## mutant-timeout-failure

Expected violation: `OutcomesSound`.

`Initial predicate` → `Submit` → `Worker` → `Next` → `Next`

## mutant-budget-admit

Expected violation: `ExpiryCut`.

`Initial predicate` → `Submit` → `Next` → `Next` → `Worker`

## mutant-stale-owner

Expected violation: `TicketOwnership`.

`Initial predicate` → `Submit` → `Next` → `Next` → `Worker`

## mutant-retired-admit

Expected violation: `NativeAdmission`.

`Initial predicate` → `Submit` → `Worker` → `Next` → `NativeAdmit`

## mutant-fabricated-resolution

Expected violation: `OutcomesSound`.

`Initial predicate` → `Submit` → `Worker` → `Lookup` → `HaltLookup` → `Resolve`

## mutant-close-pending

Expected violation: `ClosedSettled`.

`Initial predicate` → `Submit` → `Worker` → `Lookup` → `HaltLookup` → `Review` → `Close`

## mutant-close-stale

Expected violation: `ClosedEvidence`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Next` → `Next` → `Review` → `Resolve` → `Close`

## mutant-close-foreign

Expected violation: `ClosedEvidence`.

`Initial predicate` → `Submit` → `Next` → `Next` → `Review` → `Close`

## mutant-close-outsider

Expected violation: `ClosedEvidence`.

`Initial predicate` → `Submit` → `Next` → `Next` → `Next` → `Review` → `Close`

## witness-NoQueuedWitness

Expected violation: `NoQueuedWitness`.

`Initial predicate` → `Submit`

## witness-NoRunningWitness

Expected violation: `NoRunningWitness`.

`Initial predicate` → `Submit` → `Worker`

## witness-NoReconcilingWitness

Expected violation: `NoReconcilingWitness`.

`Initial predicate` → `Submit` → `Worker` → `Lookup`

## witness-NoCompensatingWitness

Expected violation: `NoCompensatingWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist`

## witness-NoSucceededWitness

Expected violation: `NoSucceededWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Finish`

## witness-NoCompensatedWitness

Expected violation: `NoCompensatedWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Finish`

## witness-NoCancelledWitness

Expected violation: `NoCancelledWitness`.

`Initial predicate` → `Submit` → `Next` → `Finish`

## witness-NoInterventionWitness

Expected violation: `NoInterventionWitness`.

`Initial predicate` → `Submit` → `Worker` → `Lookup` → `HaltLookup`

## witness-NoClosedWitness

Expected violation: `NoClosedWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Lookup` → `HaltLookup` → `Settle` → `Resolve` → `Review` → `Close`

## witness-NoNoncommitUnwindWitness

Expected violation: `NoNoncommitUnwindWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Finish`

## witness-NoUnknownInterventionWitness

Expected violation: `NoUnknownInterventionWitness`.

`Initial predicate` → `Submit` → `Worker` → `Next` → `Next`

## witness-NoCrashRecoveryWitness

Expected violation: `NoCrashRecoveryWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Next` → `Next` → `Lookup` → `Persist` → `Finish`

## witness-NoResidualClosureWitness

Expected violation: `NoResidualClosureWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Lookup` → `HaltLookup` → `Settle` → `Resolve` → `Review` → `Close`

## witness-NoBarrierWitness

Expected violation: `NoBarrierWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Disposition`

## witness-NoLateFailedReplayWitness

Expected violation: `NoLateFailedReplayWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Finish` → `Redeliver`

## witness-NoNoEffectWitness

Expected violation: `NoNoEffectWitness`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Disposition` → `Finish`

## witness-NoCommittedPrefixRollbackRecovery

Expected violation: `NoCommittedPrefixRollbackRecovery`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Finish`

## witness-NoFailedCompensationClosure

Expected violation: `NoFailedCompensationClosure`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Review` → `Close`

## witness-NoCancelledCommittedPrefix

Expected violation: `NoCancelledCommittedPrefix`.

`Initial predicate` → `Submit` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Next` → `Worker` → `NativeAdmit` → `Settle` → `Lookup` → `Persist` → `Finish`
