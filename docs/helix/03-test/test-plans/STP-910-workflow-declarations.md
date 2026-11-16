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
public preparation and transition entry points. The nightly Chromium suite exercises
the WebAssembly preparation surface.

## Acceptance criteria test mapping

| Story criterion | Issue | Acceptance evidence |
| --- | --- | --- |
| [[US-910-AC1]] | #163 | Exact duration and instant arithmetic, 90 fixed days anchored at previous completion, and one-time wait resolution. Exercise absolute pauses, picked events, duplicate permutations, conflicting-ID exclusion, deadline ties, mismatched types and keys, earlier enrollments, missing enrollment provenance, and unreachable deadlines. |
| [[US-910-AC2]] | #164 | Reject duplicate or unreachable steps, missing successors, cycles, absent else and missing or undeclared outcomes. Use an inert presentation edge that points backward. |
| [[US-910-AC3]] | #165 | Compare a batch with singleton processing. Drop and report repeated records, check terminal history across versions and permit re-entry at the exact configured minimum. |
| [[US-910-AC4]] | #166 | Reject incompatible domains and optional reads that lack a same-predicate presence test. Evaluate fresh record-local facts before effect claim. Validate bounce and STOP writes, bounded staleness, store keys, and a covering guard. Check typed run-state updates, guard suppression and increment overflow. |
| [[US-910-AC5]] | #167 | Check scope, lowered digest, effect revision changes and stale failed findings. Validate failed and inconclusive records against the versioned evidence schema. |
| [[US-910-AC6]] | #168 | Interchange retains exactly the supplied bytes including an unknown nested wide number. Compile refuses the same bytes and names the JSON Pointer. Both tiers refuse duplicate keys and malformed recognized fields. |
| [[US-910-AC7]] | #169 | Exercise drain pins, bounce and cross-version replacement intent. Preserve action versions and test scoped `id@key` repin replay, conflicting intent, undeclared dispositions and refusal after dispatch. |
| [[US-910-AC8]] | #170 | Exercise revised identity and same-body replay, changed-body refusal, suppression before dispatch, unknown, deadline timeout, late acceptance, and bounded retry. Reject unreachable timeouts and resolve at the supported boundary. Check all three await modes. |

## Executable proof

Run `cargo test --locked -p umf-core --test exact_duration --test workflow`,
`bun scripts/workflow-browser.ts` after the release-style browser build, and
`python3 scripts/workflow-reference.py`. The Python oracle checks 120 event
permutations with duplicates, an exact tie, suppression and a deleted
route control.

## Data and setup

The shared fixture uses a relative wait. Rust tests also exercise absolute
wait variants. Build the browser package with `bun scripts/build-reference-wasm.ts`.

## Build handoff

The [partial replay](https://gist.github.com/easel/dbe64f011eb6262a65e93cc515816da9/a6970fd9da09659422cd19d43baeb7f94ac98e6d)
matches the fixture and reports model bounds. Its state caps and duration-rank
abstraction limit the result to partial model evidence. Runtime conformance
requires a complete fixture execution at an identified interpreter revision
with reproducible inputs. Model results must include their properties,
assumptions, and bounds.
