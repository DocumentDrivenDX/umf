# UMF 0.10 alignment and saga design review

Owner direction, 2026-10-29: retain coupling and move current UMF development to
the 0.10 baseline. Actions and saga design stay in UMF; the temporary unpublished
umf-actions bootstrap is not a selected delivery. No new repository was published.

The SDK candidate is 0.10.0, core wire version is 0.10.0, and the existing Python
core candidate remains 0.10.3 (no downgrade). All 71 registered extension packages
already target core 0.10.0. Vocabulary and protocol IDs retain their own meaning:
actions 0.1.0, saga proposal 0.1.0, tx/1 and saga/1. Renaming them to 0.10 would
change portable identities without a semantic migration. Standalone tools and
host products keep their own versions; their exact UMF dependency must be adopted
and qualified before claiming compatibility with the new SDK release.

`spec/release.json` names the release train and SDK/core/vocabulary tuple.
`check-release-versions.py` enforces SDK/Python series, authored/generated/core
schemas, every extension dependency, action executor/plan pins and current action
contract prose. Build and fast PR checks run it. Mutation tests reject a stale
SDK version, extension pin, plan schema, Python series and normative contract.

Release source/CI changes are separated into
[PR #71](https://github.com/DocumentDrivenDX/umf/pull/71). The saga
PR contains design documents, proposal schemas, fixtures and formal experiments.
This is a source/release-candidate change in that separate PR. Released SDK 0.5.8 bytes, release tags,
archived receipts and original instance custody remain unchanged. The SDK 0.10.0
archive has not been built, installed in independent consumers or published by
this change. Its release still requires installed SDK/browser checks and exact
provider qualifications. Reconciled tx/plan prose does not requalify historical
native certificates. Core/schema semantic authority is unchanged.

## Supplied review dispositions

The review supplied by the owner examined the requirements, contract, solution,
schemas, example and models; its author did not rerun TLC or structural checks.

| Finding | Disposition |
| --- | --- |
| 1. Confirmed rollback strands prefix | Accepted: definitive forward noncommit starts reverse unwind; failed remains the original invocation outcome. No new business retry protocol. |
| 2. Intervention cannot close | Accepted: authorized close with trusted residual disposition, all tickets settled, current history sequence and atomic original-response custody. Resume and fresh compensation keys remain excluded. |
| 3. Irreversible pivot hazard | Accepted warning SAGA_PIVOT and explicit risk disclosure. Forward-only recovery needs a future profile. |
| 4. Operational constants | Keep the selected bounded profile and label its 15-minute maximum. Hosts may pin tighter limits. Longer-running profiles remain separate design work. |
| 5. Empty unwind | Define compensated with zero committed steps explicitly; retain failed/rejected/conflict and original failure cause. |
| 6. Cancel during unwind | Refuse cancellation once failure-triggered unwind starts, including reconciliation, preserving stopCause. |
| 7. Lifetime payload retention | Explicit unsupported erasure/retention policies and admission refusal. A future tombstone/payload split requires its own recovery contract; no retention compliance claim. |
| 8. Guard mutants | Narrow claims: boundary guard instrumentation, not independently proved downstream harm. |
| 9. Redelivery is inert | Preserve original model evidence with its limitation. Add Delivery.tla with an executing duplicate-effect mutant. |
| 10. Crash loses no state | Document original durable-state abstraction. Delivery.tla discards a volatile response before persistence. |
| 11. Missing protocol states | Explicitly list omitted states, noncommit, budgets, unknown intervention and closure; native/refinement acceptance remains open. |
| 12. Liveness strength | Explain finite stable-environment progress and whole-relation fairness; no real provider availability/deadline proof. |
| 13. Compensation identity | Allocate now returns allocation; a distinct deallocate action consumes that original output on its allocation binding. |
| 14. Unknown compensation forms | Preserve structural openness; unknown semantics remain unchecked and execution/edit blocking. |
| 15. Readability | Add a worked lost-ack/reconcile/reject/unwind timeline, state diagram and explicit recovery prose. |
| 16. Committed TLC logs | Retain original traces and hashes for reproducibility; avoid treating their volume/count as certification. Log storage cleanup is optional and not required for correctness. |

Requirements US-905-AC25–29 are allocated in STP-905; the irreversible warning
also has portable assessment allocation in TD/STP-906. These are planned native
and library acceptance tests, not implementation completion. The original 18-case
Saga and seven-case Admission models are unchanged and retain their original
scoped results. Delivery.tla adds three separately reported finite checks; no
composed/full-protocol proof follows.

## Verification of the earlier combined revision

- 109 existing portable action/plan/manifest/local-profile regressions passed
  across 13 test files (797 assertions); no native provider was exercised.
- Six release-drift mutation/regression checks passed; release consistency and
  regenerated action-plan producer identity checks passed.
- All 24 structural saga examples/negative controls passed with jsonschema 4.25.1.
- Three new Delivery.tla expectations passed using the pinned TLC 1.7.4 jar:
  complete safety, duplicate-effect counterexample, crash/recovery reachability.
- Forty-five saga acceptance criteria have explicit test-plan mappings.
- Seventeen catalog artifact checks passed. Three older action artifacts retain
  identical baseline template findings (US-900, US-902, SD-900); the baseline was
  checked separately, and this version alignment introduces none of those findings.
- Original model/runner/log and current schema/delivery evidence hashes verified;
  git diff whitespace checks passed. Historical Saga/Admission runs were not rerun
  because their model/runner sources are unchanged.

Installed SDK distribution, Chromium and native saga execution remain unqualified
for this candidate; the source regression checks do not imply those release gates.

## PR comment corrections, 2026-10-29

- Restored independent outcome and closed history-event guards. Outcome events
  require invocation and full original result; closed events require disposition
  and original stopCause. Missing-field negative controls verify both families.
- Closed and intervention-required state projections require stopCause. Previously
  latched failure/cancellation survives; a first coordination stop uses
  intervention plus its protected-safe code instead of fabricating business failure.
- Repaired the state-table row and separated cancellation/reconciliation prose.
- Moved all 17 release-only paths to PR #71; its additional evidence record makes
  18 files in that PR. PR #70 now changes only docs/helix design/schema/examples
  and formal evidence. Merge #71 first to reconcile the existing stale action
  contract baseline before integrating this core 0.10 saga design.
- Recorded the deferred compensation-reattempt gap and the conditions a future
  profile would need. Sequential/1 still requires out-of-band remediation and
  settled closure after confirmed compensation failure; no resume is implied.
- Renamed deallocate's write frame to deallocate-write. Kept the action schema's
  sole caller-key-optional declaration and clarified mandatory durable keys for
  every saga invocation, including compensation.

Current saga-only verification: 36 structural cases, 11 catalog artifact checks,
45 acceptance mappings, 418 local links, original/current formal and schema
evidence hashes and git diff whitespace checks. The unchanged formal models were
not rerun; their qualification scope is unchanged. The split release branch reran
its six release tests, consistency and generated identity checks successfully.
Native saga implementation, full protocol refinement and release qualification
remain separate unexecuted gates.
