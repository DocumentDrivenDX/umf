---
ddx:
  id: STP-078
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-078
      kind: informed_by
    - id: TD-078
      kind: informed_by
    - id: SD-008
      kind: informed_by
    - id: CONTRACT-900
      kind: references
    - id: TP-001
      kind: references
---

# STP-078: Declarative action verification

## Story Reference

**User Story:** [[US-078-declarative-actions]].
**Technical Design:** [[TD-078-declarative-actions]].
**Solution Design:** [[SD-008-declarative-actions]].
**Project Test Plan:** [TP-001](../test-plan.md).

## Scope and Objective

Prove the local core 0.8.0 / `umf.actions` 0.1.0 declaration subset through public
APIs. Contract, assessment and preservation assertions carrying AC1–AC8 citations
now pass; the scoped public-bundle corpus agrees in Chromium and Bun (AC9).
[current evidence](../../04-build/evidence/actions-certification.md) records exact
versions and limitations at its captured sources. That recorded qualification
includes the separately allocated bounded transactional consumer. Passing
declarations alone do not establish native execution support; changed integrated
sources require fresh regression and qualification.

## Acceptance Criteria Test Mapping

Bun tests belong in `tests/actions/contracts.test.ts`,
`tests/actions/assessment.test.ts` and `tests/actions/preservation.test.ts`.
Each implemented test must carry its listed canonical citation and exercising
assertions; a citation alone is not evidence.

| Criterion | Planned test | Assertions | Citation |
| --- | --- | --- | --- |
| US-078-AC1 | `exact targets and stable identity` | Same names in different modules remain distinct; wrong-kind/absent Key refuses; copy lookup cannot mutate source. | `@covers US-078-AC1` |
| US-078-AC2 | `rules and handlers are inert` | Retain failure/profile text; unchecked warning; handler/getter/network sentinels remain untouched. | `@covers US-078-AC2` |
| US-078-AC3 | `ordered create link and property effects` | Three-effect create/link fixture; forward/self references, wrong membership, Key set and use after delete refuse; no defaults/cascades added; frozen pre-state selectors/absent created keys and limits; recipe/handler exclusivity; permitted writes versus required effects; declaration/obligation metadata for conditional handler no-op and postcondition
  failure versus durable precondition rejection; no runtime state or ledger assertion in this row. | `@covers US-078-AC3` |
| US-078-AC4 | `mandatory execution obligations` | Omitted/null policies refuse; complete declarations enumerate frozen frames, typed handler output/post-state entity rules, recipe outputs=[] restriction, failures/retryable semantics and attribution/replay/atomicity/result/role obligations without enforcement claims. | `@covers US-078-AC4` |
| US-078-AC5 | `profile comparison does not prove execution` | Every obligation represented; exact snapshots only; missing/unsupported/unknown claims, including selector claims, incompatible; unknown-member override blocked; supported evidenced claims still executionVerified false. | `@covers US-078-AC5` |
| US-078-AC6 | `unknown recovery and conservative edits` | Deep equality through JSON/YAML; referenced unknowns block edit; unrelated future vocabulary survives; no source/result aliasing. | `@covers US-078-AC6` |
| US-078-AC7 | `DDD bindings are explicit` | Same-named unbound operation creates no action; exact binding validates; absent service/operation refuses; DDD payload stays unchanged. | `@covers US-078-AC7` |
| US-078-AC8 | `atomic diagnostic and limit refusals` | Code/path/severity sets for duplicate IDs, invalid version/shape and each boundary+1; no partial output or getter execution. | `@covers US-078-AC8` |
| US-078-AC9 | `scripts/actions-browser.ts` | Public APIs on full fixture corpus; compare ordered outputs/diagnostic sets, both formats, no Bun/process globals. | `@covers US-078-AC9` |

## Executable Proof

Use the actual separate portable inventory and qualification commands:

```sh
bun test ./tests/actions/*.test.ts
bun run typecheck
bun run test:schemas
bun run build
bun scripts/actions-browser.ts
bun scripts/acceptance-traceability.ts --check
```

Record exact Bun/Chromium and dependency versions, source fingerprints, outcomes,
logs, subset and limitations under `04-build/evidence/`. Relevant core Key,
relationship, schema-property and DDD regression must pass. Current release
qualification gaps remain independent; do not reuse older green totals.

## Data and Setup

Use `fixtures/actions/create-link.json` with full keyed order/customer/
product Records, scalar Fields, explicit members and independent directed
relationships. Declare three effects, a synthetic role profile, optional opaque
condition and unknown extensions. No state executor or real identity is needed.

Use `fixtures/actions/cases.json` with language-neutral inputs, targeted core/
extension versions and expected validity, interpretation completeness and
code/path/severity diagnostic sets. Normative rule expectations derive from
CONTRACT-900; message wording is excluded. This is action-slice conformance, not
all-core cross-language certification. Add association Record/composite-Key
fixtures, same-name collisions, unknown members, unsupported float/temporal
values, key mutation, profile drift and limit vectors.

## Separate Consumer Execution Qualification

These are required witnesses before any executor support claim, not US-078
library acceptance. Pin exact store, executor/role/rule/handler versions,
declaration and data snapshot. A mock executor or generated schema is insufficient.

| Witness | Required observation |
| --- | --- |
| Create/link and untouched third record | One created record/two links; third record and undeclared properties unchanged. |
| Concurrent equal-key retries and lost acknowledgement | At most one commit; recover the original identities/version/receipt. |
| Same key, changed input/declaration or expired key | Conflict/refusal; no new write. |
| False condition / version conflict; evaluation error / final-effect failure | Admitted terminal business rejection/conflict persists its original outcome without business writes. Transient evaluation/execution failure rolls back business writes and creates no terminal outcome. |
| Role denial, revoked replay access, service-only attribution | Refuse before disclosing condition details or returning protected result. |
| Concurrent state/key/relationship changes | Consistent revalidation or abort; no partial/invalid commit. |
| Native triggers/cascades and named handler | Detect/refuse undeclared side effects; per-effect claims match observed writes. |
| Composite keys, association instances, aliases | Qualified equality, endpoints and multiplicity agree; unsupported layouts refuse. |
| Receipt on read, including lagging warehouse | Same-store at-least-commit read succeeds or explicitly waits/refuses; no inferred cross-store guarantee. |

## Build Handoff

TD-078 sequences schemas/fixtures and exercising tests before implementation,
then public API/browser and regression evidence. Every criterion remains UNTESTED
until its assertions execute and pass with canonical citations. Record failed
attempts and environmental browser failures as failures, not acceptance. Keep
executor evidence and library declaration evidence separate.

## Executed feasibility evidence (separate gate)

[Design plan evidence](../../04-build/evidence/actions-plan-execution.md) records
21 real-store histories, five mutation discriminators, finite protocol exploration
and a small portable/browser representation probe. These do not satisfy any
public-library acceptance criterion. Add explicit tests for poststate binding,
finite read/write frames, recipe-versus-handler semantics, output/failure typing
and combined condition/frame limits to the planned AC2/3/4/5/8 suites. Runtime
witnesses must also cover deployment retry, durable rejection after state change,
fresh-key no-op versus replay and contiguous projection visibility.

## Iteration 2 profile qualification allocation

CONTRACT-901 adds consumer-owned requirements; the earlier 21-history SQL
harness, sentinel check and browser representation do not satisfy them. US-056,
TD-056 and STP-056 allocate the later bounded consumer implementation and
EX-01–EX-05 native witnesses. Their completed source-bound evidence is recorded
in the historical certificate; fresh integrated qualification remains independent.

| Witness | Requirements | Independent observations / discriminators |
| --- | --- | --- |
| EX-01 rule/selector interpretation | ACT-09 | Type/phase/arity/dependency errors refuse even in short-circuited branches; missing differs from null; integer arithmetic retains exact core semantics; depth/node limits refuse atomically; selectors use only input keys; aliases cannot expand permissions. Faulty coercion, skipped static branch checks and state-dependent selector variants must be rejected. |
| EX-02 auth/revision/reconciliation | ACT-10/ACT-11 | Authorize before protected lookup/preview; concurrent policy revocation versus commit has qualified serialization order; r1 replay remains interpretable after handler retirement or input-schema change; missing original interpretation refuses without execution; lookup never executes; key tombstones/horizon prevent reuse; service change preserves principal token scope; crash/restart/ambiguous-response reconciliation returns original terminal outcome. |
| EX-03 invariant boundary and handler access | ACT-12 | Concurrent absent-key creation and phantom relationship additions cannot violate declared invariants; deadlock/serialization aborts retry at most three total attempts; unknown commit status cannot retry as rollback; intercepted outside-frame reads/writes and raw connection/network attempts fail before execution; postcondition/output failure rolls back. Native trigger/cascade effects need separate observed coverage. |
| EX-04 preview | ACT-13 | Invalid parameters/policy/state produce authorized explanations; preview invokes no handler or external operation, adds no replay/audit business record, and promises no calculated edits or future commit. State changed after preview is rechecked at invocation. Bypassing validation or treating the receipt as a reservation must be caught. |
| EX-05 audit/visibility/evolution | ACT-12/ACT-13 | Terminal audit/outcome/business writes commit together; rejected/denied/rollback telemetry distinction survives crashes; callers cannot spoof actor/build/policy version; protected audit/raw inputs are not disclosed; wrong store/epoch receipts refuse and out-of-order events do not advance a contiguous projection prefix; compatibility change review flags strengthened preconditions, weakened postconditions and expanded frames without silently adopting a revision. |

Add portable-library AC2/4/5/8 cases for the role/policy union, exact new profile
versions, rule/selector phase/type/dependency metadata and unknown-profile refusal.
Static checker execution needs separate interpreter-version proof; public base
inspection still evaluates no runtime state and invokes no policy/handler.

The bounded consumer has its own US-056 story, TD-056 design, STP-056 test
allocation, handler isolation and native-store adapter. These witness IDs describe
requirements allocation; only separately recorded exercising witnesses establish
executed acceptance coverage for a specified source and profile.

## Astra review closure: normative counterexamples

`02-design/experiments/actions/design-counterexamples.json` is fixture data for
future full-schema/runtime tests, not executable acceptance evidence.

- AC3/8: duplicate frame IDs within reads, within writes and across both lists
  must diagnose ACTION_IDENTITY; unresolved references diagnose ACTION_REFERENCE.
- AC4/5: recipe verification covers every effect (including mixed changes/no-ops)
  exactly once/in order; handler verification names its qualified deployment and
  every postcondition. Missing/extra/mismatched verification cannot be committed.
- EX-03/05: runtime primitive effect outcomes versus net changes, all-no-op and
  changed-then-restored cases, and byte/data-equal retained verification on replay.
- EX-01/02: combined expected-version mismatch plus false/erroring precondition;
  absent input versus stale version; declaration/input errors versus business
  failures. Assert status/code, whether evaluation ran, zero business changes and
  exact terminal outcome count; replays preserve the first decision.

AC3 is portable declaration/reference/obligation coverage. Actual state changes,
no-op verification, rollback and durable rejection are executor witnesses only.

## Formal-analysis counterexample allocation

EX-01: directed set-association linked pre/post predicates, endpoint/phase/read
coverage and unsupported layouts; missing reservation record and nonpositive
quantity must be excluded by complete intent fixtures, not just stock equations.
EX-03: same native entity reached by primary/alternate Keys, delete/use aliases,
ambiguous canonical resolution and absent alternate-Key creation refusal; disjoint
edge writes sharing a to-one target invariant must serialize or conflict. Track
attempted outside-frame reads and writes even when final state is restored.
The new semantics are design corrections; earlier native/evaluator evidence does
not qualify their implementation.

US-056 / TD-056 / STP-056 now own the full native runtime journey and EX-01–05
transactional witnesses. Shared portable case decisions execute in Bun and Chromium
through `tests/actions/case-corpus.ts`; report schemas have actual-output and negative
validation tests in `tests/actions/reports.test.ts`.
