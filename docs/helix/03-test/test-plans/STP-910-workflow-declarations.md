---
ddx:
  id: STP-910
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-910
      kind: informed_by
    - id: TD-910
      kind: informed_by
    - id: CONTRACT-909
      kind: informed_by
    - id: CONTRACT-910
      kind: informed_by
---

# STP-910 Workflow declaration conformance

## Story reference

[US-910](../../01-frame/user-stories/US-910-author-workflow-declarations.md). Design entry [[TD-910-02]].

## Scope and objective

Use the Follow-up reply fixture under `crates/umf-core/tests/fixtures/workflow/`.
All provider and record values in this story are synthetic. Rust tests exercise
public preparation and transition entry points. The Chromium suite exercises
the shipped WebAssembly preparation surface.

## Acceptance criteria test mapping

| Story criterion | Issue | Acceptance evidence |
| --- | --- | --- |
| [[US-910-AC1]] | #163 | Exact duration and instant arithmetic, 90 fixed days anchored at previous completion, and one-time wait resolution. Exercise absolute pauses, picked events, duplicate permutations, deadline ties, mismatched types and keys, earlier enrollments, and missing enrollment provenance. |
| [[US-910-AC2]] | #164 | Reject duplicate or unreachable steps, missing successors, cycles, absent else and missing or undeclared outcomes. Use an inert presentation edge that points backward. |
| [[US-910-AC3]] | #165 | Compare a batch with singleton processing. Drop and report repeated records, check terminal history across versions and permit re-entry at the exact configured minimum. |
| [[US-910-AC4]] | #166 | Reject incompatible domains and optional reads that lack a same-predicate presence test. Evaluate fresh record-local facts before effect claim. Exercise both suppressed and allowed outcomes. |
| [[US-910-AC5]] | #167 | Check scope, lowered digest, effect revision changes and stale failed findings. Validate the failed record against the versioned evidence schema. |
| [[US-910-AC6]] | #168 | Interchange retains exactly the supplied bytes including an unknown nested wide number. Compile refuses the same bytes and names the JSON Pointer. Both tiers refuse duplicate keys and malformed recognized fields. |
| [[US-910-AC7]] | #169 | Exercise drain pins, bounce and cross-version replacement intent. Preserve action versions and test queued repin replay, conflicting intervention and refusal after dispatch. |
| [[US-910-AC8]] | #170 | Exercise revised identity and same-body replay, changed-body refusal, suppression before dispatch, unknown, deadline timeout, late acceptance, and bounded retry. Check all three await modes. |

## Executable proof

Run `cargo test --locked -p umf-core --test exact_duration --test workflow`,
`bun scripts/workflow-browser.ts` after the release-style browser build, and
`python3 scripts/workflow-reference.py`. The Python oracle checks 120 event
permutations with duplicates, an exact tie, suppression and a deleted
route control.

## Data and setup

The shared fixture contains eight steps, elapsed and absolute wait variants,
and synthetic typed event and record values. Build the Rust WASM package with
`bun scripts/build-reference-wasm.ts` and use the pinned Chromium test runner.

## Build handoff

The external consumer conformance gate names its specific
build, model bounds and source custody before replay.
