# Saga proposal examples

`allocation.json` is a fabricated complete current-core Document. The shared
Field/Key/action declarations use existing UMF shapes. The new saga payload is
proposed by CONTRACT-908; its inert handler profile is not installed or qualified.
`submit.json` contains a closed logical request with a host-issued revision
placeholder. Neither fixture grants provider, tenant or execution authority.

Run `verify.py` from any directory with Python 3.9+ and jsonschema 4.25.1.
It loads all referenced JSON Schemas from explicit local sources and performs
no network resolution. It validates the action and saga payload structures,
request/result examples and negative structural controls. The containing core
Document's full semantics, reference/type compatibility, safe edits, native
profiles and browser interpretation remain implementation tests in STP-906/905.
Unknown-member examples prove retention shape only, never semantic eligibility.

The report is retained in `../../experiments/saga/evidence/schema-results.json`
with source hashes and precise validation limits. This verifier is a design
example check and introduces no runtime package or production API.

## Binding and compensation identity

Reserve returns reservation on the inventory binding. Allocate returns its own
allocation on the allocation binding; deallocate consumes that exact retained
allocation output. Release consumes the reservation output on inventory. The same
portable Key shape across the stores asserts no shared native entity. Each
provider resolves and authorizes its original identity independently.

## Worked recovery timeline

Consider a three-step variant: reserve, allocate, confirm. Each has an action
compensation using its own retained original output.

1. Submit commits one instance and its original submitted result.
2. Reserve commits; its original outcome is retained by the coordinator.
3. Allocate commits in its provider, but the reply is lost before coordinator
   observation persists. The instance reconciles; confirm and compensation wait.
4. Restart and lookup the original allocate key. Retain its original committed
   result and allocation identity; do not regenerate or substitute it.
5. Confirm definitively rejects. Latch failure as stopCause and unwind.
6. Deallocate the retained allocation, then release the retained reservation.
   Each is a new independently authorized business action with its own original key.
7. End compensated, retaining confirm's rejection and both compensations. A cancel
   during step 6 refuses and cannot hide the failure. An uncertain compensation
   instead blocks earlier recovery until reconciled or requires intervention.

A definitive rollback at step 5 also unwinds this prefix while retaining failed
as that invocation's outcome. Failure at the first step yields compensated with
an empty prefix. Closed is reserved for attributable operator acceptance of
settled residual effects, not successful compensation.
