---
ddx:
  id: STP-906
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-906
      kind: derived_from
    - id: TD-906
      kind: informed_by
    - id: CONTRACT-908
      kind: references
---

# STP-906: author and assess sagas

## Story Reference

**User Story:** [[US-906-author-and-assess-sagas]]
**Technical Design:** [[TD-906-author-and-assess-sagas]]
**Solution Design:** [SD-901](../../02-design/solution-designs/SD-901-saga-semantics.md)
**Project Test Plan:** [TP-001](../test-plan.md).

## Scope and Objective

Prove the selected story against CONTRACT-908 through the shared Rust operations
and actual host bindings. The current allocation below names executable fixture
IDs in place of the original design-only handoff filenames.
Qualification belongs to the exact source-bound evidence packet, not this plan.
Structural/TLC evidence cannot establish product, browser or native execution.

**Blocking gate:** all story rows need source with canonical citations,
independent expected outcomes and recorded results before implementation completion.
Portable completion requires the shared Rust operation family and actual Chromium, not a TypeScript-only semantic fork.

## Current Acceptance Criteria Test Mapping

The exact fixture IDs below live in `fixtures/saga/portable.json` and run through
`scripts/saga-portable/verify.ts` on N-API, actual Chromium WASM, CLI and installed
Python. Focused Rust checks live in `crates/umf-codegen/src/actions/saga/tests.rs`.

| AC | Current fixture / witness | Required assertion |
| --- | --- | --- |
| US-906-AC1 | `ordered-baseline`, `duplicate-step` | Exact identity/order; duplicate IDs refuse. |
| US-906-AC2 | `missing-output`, `missing-required-output`, `different-key-identity`, `recipe-missing-output` | Earlier output type/presence and exact Key identity; wrong/missing mappings diagnose. |
| US-906-AC3 | `forward-later` | Invalid dependency order refuses with located reference diagnosis and no eligible partial output. |
| US-906-AC4 | `ordered-baseline`, `compensation-later` | Original compensation mappings retained; later-output mapping refuses. Native unwind is STP-905. |
| US-906-AC5 | `terminal-irreversible`, `early-irreversible` | Explicit irreversible disposition; exact early SAGA_PIVOT location; no inferred inverse. |
| US-906-AC6 | `missing-compensation`, `no-inferred-compensation` | Missing disposition prevents eligibility. |
| US-906-AC7 | `unknown-recovery` plus `verifySagaExchange` | Real JSON/YAML exchange retains unknown/native data exactly. |
| US-906-AC8 | `unknown-recovery` | Unknown obligations remain unchecked; dependent edit refuses without source mutation. |
| US-906-AC9 | `recipe-declaration` independent complete positive claim inventory; `ordered-baseline` incomplete declaration | Separate exact action/binding/finality obligations; tx-only, missing, duplicate and wrong-source claims do not qualify. |
| US-906-AC10 | `unknown-external-profile`, `external-action-meaning` | Profile metadata cannot widen actions 0.1.0 atomicity. |
| US-906-AC11 | `inert-handler-url`, native/browser fetch traps | Artifact names cause no host lookup/effect; Rust remains the shared semantic owner. |
| US-906-AC12 | `at-32-steps`, `over-32-steps`, focused Rust limits | At-limit succeeds; explicit overflow refusal, never eligible truncation. |
| US-906-AC13 | Entire static corpus via native/browser runners | Actual N-API and Chromium satisfy independent expected outcomes and exact diagnostics. |
| US-906-AC14 | `ordered-baseline` assessment | Compatibility/coordination claims remain distinct from runtime completion; executionVerified is false. |
| US-906-AC15 | `unknown-external-profile`, `external-action-meaning` | An inert handler/profile annotation does not enable external effects. |
| US-906-AC16 | `recipe-declaration`, `recipe-missing-output` | Recipe binding is considered; unavailable output remains a separate error. |

This allocation is not a test-total completion claim. The source-bound
[released packet](../../04-build/evidence/sagas/README.md) remains historical;
the [test-tightening plan](../../04-build/actions-sagas-test-tightening-plan.md)
governs new oracle/custody controls. Static expected diagnostic code/severity/path
tuples and representative complete obligation inventories are authored from the
contract and fixture, never generated from the inspected result under test.

`tests/saga/portable-oracle.test.ts` exercises the real verifier with a no-op edit,
wrong diagnostic path/severity, unexpected diagnostics and omitted inherited
obligations. Each mutant must fail a named assertion. Successful edits assert the
requested field change, stable identity, unchanged unrelated content and caller
preservation. Returned-source mutation must not poison later inspection. Support
claims use independent expected obligations; missing/duplicate/unsupported or
wrong-source/identity claims refuse and executionVerified never becomes true.


## Executable Proof

The schema/example verifier is available at
`docs/helix/02-design/examples/saga/verify.py`; it validates structures and negative
shape controls only. The 18-case abstract coordination run and seven-case
admission-boundary run live under `02-design/experiments/saga`; their source/config
hashes must match. Neither test set closes any whole native or browser AC row.

### Current Commands

`cargo test --locked -p umf-codegen saga`,
`bun test tests/saga/portable-oracle.test.ts`,
`bun scripts/saga-portable/native.ts` and
`bun scripts/saga-portable/browser.ts` are semantic/parity gates.
After building matching artifacts, run `scripts/saga-portable/other-hosts.ts`
with `cli` or `python`, setting UMF_SAGA_CLI or the exact UMF_SAGA_PYTHON and
UMF_SAGA_PYTHON_WHEEL. Run `scripts/test-sdk-install.ts` for the installed public
facade/bundled WASM. The browser records actual Chromium and binding/WASM digests.

Retain failures, exact versions and source/resource/binary hashes with observed
results; fixture availability alone is not execution. The collector must refuse
substituted or stale host artifacts even when the corpus is unchanged.

`tests/saga/custody.test.ts` exercises new receipt validation separately from the
historical release packet. The exact host roster is native, browser, CLI, selected
Python wheel and source-rebuilt Python wheel. Every report must match the
authoritative corpus's unique IDs/coverage and hash its relevant verifier,
resource and artifact inputs. No second manually maintained case roster is needed.
The collector verifies selected wheel/sdist and SDK archive/manifest/install
custody, hashes the copied destination against the validated expected bytes and
rechecks input stability before publishing a fresh atomic cohort directory.
Missing/replaced host, binary, resource, result or rebuild evidence must refuse.

## Data and Setup

Use the fabricated equipment allocation Document and closed submit request in
`docs/helix/02-design/examples/saga/`. Include malformed known declarations,
relevant and unrelated unknown metadata, literal/Key/presence boundaries and
capacity overflows. Pin installed handler, action and provider profiles separately.

Use independent expected diagnostics for JSON Pointer ordering, original source
preservation and type identity. Inject attempted host calls and verify none occur.
Mutation controls remove type/order/unknown guards and must fail their named
assertions. Compare original/copy state after both successful and refused edits.

## Edge Cases and Failure Modes

Unknown interpretation, stale provider custody, oversize values and lost original
results refuse unsafe work while preserving source/outcome obligations. Reordering
an unordered display does not change authored step order. Missing observations
are not negative evidence. No unsupported external profile becomes eligible by
changing an inert handler name.

## Build Handoff

Implement the contract-owned pure interfaces first, then story-specific fixture
assertions and actual host/binding integration. Extend boundary checks and add
negative controls before claiming new source-family support. Require passing
per-AC results and exact installed versions for completion; retain untested
obligations as unverified. No production orchestrator or UI delivery is included.

## Irreversible barrier review control

US-905-AC28 additionally maps to `early-irreversible`, `terminal-irreversible`
and Rust `pivot_warning_is_located_and_wrong_source_claims_refuse`: an early irreversible step followed by action-compensated
work emits SAGA_PIVOT with exact paths and preserved source; a terminal irreversible
step emits no early-barrier warning. Native risk disclosure remains STP-905's
separate obligation. Actual results remain scoped by their evidence receipt.

## Finality assessment allocation

US-906-AC9's assessment cases require exact per-step/direction
`saga.invocation.finality` obligations and evidence claims. Test missing, duplicate,
wrong-source and bare-tx1 claims as unsupported/unknown. Complete declaration and
host claims never set executionVerified:true. The finite model checks the
coordination rule only; it does not replace the portable/library/browser cases.
