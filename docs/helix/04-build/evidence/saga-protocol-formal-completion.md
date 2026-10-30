# Saga protocol formal-validation completion

Owner request, 2026-10-29: finish the remaining TLA+ coordination work and update
actions/saga specifications from its findings. PRs #70 and #71 merged while the
follow-up was in progress; this packet is a separate follow-up to that baseline.

## Completed finite analysis

The [combined model and scope](../../02-design/experiments/saga/formal/protocol.md)
and [source-exact report](../../02-design/experiments/saga/evidence/protocol/report.json)
cover all nine lifecycle phases, confirmed noncommit and committed-prefix unwind,
irreversible/no-effect dispositions, volatile crash loss, cancellation/reconciliation,
lookup and elapsed budgets, original resolution and settled closure. All 43
expectations passed: seven complete safety/progress explorations, 17 exact semantic
mutants and 19 reachability witnesses (16 primary plus three stronger composite
queries over unchanged transitions). Twenty-two state invariants are checked in
the full safety cuts. All 45 saga acceptance criteria retain test-plan allocation.

| Complete exploration | Distinct states | Result |
| --- | ---: | --- |
| smoke | 71 | Complete; no safety/temporal violation |
| safety-two | 10,189,901 | Complete; no safety/temporal violation |
| safety-three | 38,201 | Complete; no safety/temporal violation |
| safety-irreversible | 3,484,581 | Complete; no safety/temporal violation |
| safety-no-effect | 3,491,581 | Complete; no safety/temporal violation |
| progress-stable | 2,357 | Complete; no safety/temporal violation |
| progress-success | 89 | Complete; no safety/temporal violation |

The two temporal cuts use separate weak fairness for worker, native gateway,
provider settlement and observer, with stable authority, no faults/deadline expiry
and responsive lookup. Mixed results eventually stop automatic work; supported
all-commit work eventually succeeds. No whole-Next fairness shortcut is used.

The bounded assurance is complete for the exact configurations in the report.
It is not an arbitrary-size theorem, a proof for all 32 steps/fault counts or an
implementation refinement. Initial providers are active; faults start after
submission. Crashes discard a real volatile observation. One/two-lookup bounds
exercise exhaustion and remaining-budget recovery. Native atomicity, issuer
predicates, policy serialization, full typed admission, multi-tenant custody,
real clocks and capacity remain separate qualification obligations.

## Specification changes from the analysis

- Definitive noncommit must close the entire original logical ticket after all
  admitted native attempts settle. Base tx/1's missing business-outcome row or
  one attempt's rollback cannot authorize unwind. Every delayed same-ticket
  delivery must recover its original failed disposition and produce zero effects.
- Every forward/action-compensation binding has a distinct finality recovery
  obligation. Plain tx/1/key support cannot satisfy it; portable assessment still
  reports executionVerified:false. The declared wire vocabulary is unchanged.
- Stop-cause arbitration uses the first serialized coordinator decision. A later
  observation of an earlier provider event cannot overwrite that recorded cause.
- Lookup counts, elapsed budget, custody and stop history persist through crash,
  takeover and redelivery. Exhaustion can retain pending custody and never creates
  failure, fresh work or automatic resume. Original protected resolution remains
  possible without replenishing the automatic budget.
- Strong witnesses require actual committed forward and compensation effects
  around a later failed step, failed-compensation closure with residual effects,
  and cancellation with a committed/recovered prefix; empty work alone is not used
  as evidence for those scenarios.

CONTRACT-901/908, FEAT-901, US-905/906, SD-901, TD-905/906 and STP-905/906 carry
these findings and planned native/library correspondence. Full structural fixture
checks still pass (36 cases). The original Saga/Admission/Delivery results are
retained as narrower historical evidence, not relabeled as combined verification.

## Evidence custody and review

The report pins model/harness/publisher/tool/configuration sources. Compressed
original logs retain full states; [compact action traces](../../02-design/experiments/saga/evidence/protocol/traces.md)
make the counterexamples reviewable without thousands of raw log lines.
`publish_protocol.py --verify` validates all 43 cases from tracked files alone.
`check_protocol_evidence.py` checks an independent temporary copy and rejects
changed model, configuration, original log, case bounds, missing case and tool pin.
The evidence consistency checks prove no execution attestation or native behavior.

Native saga implementation, installed bindings/browser conformance, real gateway
finality and production execution remain unimplemented qualification work. No
executor or release is deployed by this documentation/formal-analysis change.
