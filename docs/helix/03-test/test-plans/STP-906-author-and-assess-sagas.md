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

Prove the selected story against CONTRACT-908. Every row below is a planned
implementation test, not a completion claim. Existing structural/TLC evidence
supports only its recorded subset. No product semantic, browser or native case
is marked passed merely because a model or proposal schema passed.

**Blocking gate:** all story rows need source with canonical citations,
independent expected outcomes and recorded results before implementation completion.
Portable completion requires the shared Rust operation family and actual Chromium, not a TypeScript-only semantic fork.

## Acceptance Criteria Test Mapping

| AC ID | Planned test | Asserted behavior | Canonical citation | Level | Planned file |
| --- | --- | --- | --- | --- | --- |
| US-906-AC1 | `identities_in_declared_order` (planned) | Inspect exact identities and array order, independently of names. | `@covers US-906-AC1` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC2 | `earlier_output_type_and_presence` (planned) | Accept exact earlier output; refuse wrong identity, later or absent required source. | `@covers US-906-AC2` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC3 | `missing_and_cyclic_references` (planned) | Locate missing/cyclic references and refuse eligible partial output. | `@covers US-906-AC3` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC4 | `original_compensation_inputs` (planned) | Retain original typed input bindings and reverse recovery order. | `@covers US-906-AC4` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC5 | `irreversible_disposition` (planned) | Expose irreversible effect without inferring an inverse action. | `@covers US-906-AC5` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC6 | `missing_disposition_refuses` (planned) | Missing compensation disposition prevents eligibility. | `@covers US-906-AC6` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC7 | `unknown_native_roundtrip` (planned) | JSON/YAML retain unknown recovery and unrelated native payloads. | `@covers US-906-AC7` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC8 | `unknown_edit_and_execution_refuse` (planned) | Dependent edits and eligibility refuse while original stays unchanged. | `@covers US-906-AC8` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC9 | `action_support_is_not_coordination` (planned) | tx-only claims do not establish saga support or execution verification. | `@covers US-906-AC9` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC10 | `external_profile_cannot_widen_tx` (planned) | Single-store profile cannot qualify external-effect steps. | `@covers US-906-AC10` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC11 | `inspection_has_no_host_effects` (planned) | Artifact code/resource names trigger no process, import, fetch or business effect. | `@covers US-906-AC11` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC12 | `finite_limits_refuse_completely` (planned) | At-limit input works; above-limit analysis refuses without eligible truncation. | `@covers US-906-AC12` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC13 | `bun_chromium_independent_oracle` (planned) | Bun and real Chromium match independent expected diagnostics for the same source. | `@covers US-906-AC13` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC14 | `completion_meanings_are_distinct` (planned) | Success and compensated termination remain distinct; neither asserts distributed atomicity. | `@covers US-906-AC14` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC15 | `external_declaration_version_gate` (planned) | Another handler/profile on actions 0.1.0 does not enable external effects. | `@covers US-906-AC15` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |
| US-906-AC16 | `recipe_binding_is_not_disqualified` (planned) | Supported recipe actions are considered; unavailable outputs remain separate errors. | `@covers US-906-AC16` (required in planned source) | Rust + Bun; browser for AC13 | `tests/saga/declarations.test.ts` |

## Executable Proof

The schema/example verifier is available at
`docs/helix/02-design/examples/saga/verify.py`; it validates structures and negative
shape controls only. The 18-case abstract coordination run and seven-case
admission-boundary run live under `02-design/experiments/saga`; their source/config
hashes must match. Neither test set closes any whole native or browser AC row.

### Planned Commands

`cargo test -p umf-codegen saga`, `bun test tests/saga/declarations.test.ts`
and `bun scripts/saga-browser.ts` are planned semantic/parity gates.
The browser command must record actual Chromium and binding/WASM digests.

These files/commands are build handoff targets and are not claimed to exist in
this design PR. Implementers must retain failures, exact versions and source
hashes with their observed results; fixture availability alone is not execution.

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
