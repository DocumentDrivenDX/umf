---
ddx:
  id: umf.evidence.rust-migration.r8-core-evolution-candidate
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-058
      kind: implements
    - id: ADR-006
      kind: informed_by
---

# R8 Core Evolution Rust candidate

`src/access/rust-core-evolution-candidate.ts` is a private adapter over the
existing Node core-model engine's Rust-owned `inspectCoreEvolution` and
`verifyCoreEvolution` operations. It maps `CORE_EVOLUTION_*` native errors to
the public `UmfError` class and leaves Rust-only resource/control errors
unchanged. Neither V4 root selects the adapter; the TypeScript reference
remains the package-root behavior.

The focused tests compare Rust inspection with all seven cases in the frozen
current-source 0.10 packet, verify a current receipt, reject a forged receipt,
check adapter error handling, and compare a wider negative-control matrix
against same-host TypeScript. Repository typecheck passes:

```sh
bun test tests/core/rust-core-evolution-candidate.test.ts
bun run typecheck
```

Sol rebuilt the Node addon from the current Rust source and reran the expanded
same-host Bun suite: 4 tests and 24 assertions passed, including the reordered
element receipt. Typecheck passed. This is a private binding comparison, not a
built V4 default package or installed-package qualification.

## Default-route gate remains open

No V4 export was replaced because CONTRACT-058's full acceptance and resource
matrix is not yet proven. The existing R5 evidence records a source/contract
version divergence: the contract names a 0.8.0 precondition while the frozen
predecessor and current generated core schema use 0.10.0. The seven-case packet
does not establish every listed negative control. The contract also has a
duplicate `CONTRACT-058` identity used by the legal-appellate fixture; its
disposition is open.

## Follow-up source probes — 2026-10-26

The Rust source now pins required additions, retained and changed unknown root
content, removal of an existing definition, element reordering, changed
facets/defaults/Keys/relationships, changed document identity, wrong source
version, and duplicate presentation names with distinct identities. Reordering
exposed exact receipt drift: Rust emitted a non-null `afterPath` for a
`removed-definition`, while TypeScript emits `null`. Rust now matches the
predecessor and a focused Rust regression asserts the null path. The expanded
same-host Bun matrix compares full receipts and refusals across those cases.
A fresh Node addon replaced the stale ignored local build before the passing
rerun.

The expanded Rust suite passed 10/10 with Rust 1.90.0:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-core-evolution-current-target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
cargo test --locked --offline -p umf-core --test r5_core_evolution
```

Input preflight now tests the exact 100,000-value and 4,000,000-byte edges.
At each edge, malformed source inputs proceed to `CORE_DATASET_SOURCE`; the
first larger input refuses with `LIMIT`. This proves the aggregate input
preflight boundary. A retained-output probe also reaches exactly 100,000
aggregate values and 4,000,000 aggregate compact-JSON bytes across policy,
before, after, and receipt, then refuses the first added value/byte with
`LIMIT`. A same-host Bun test confirms the Rust candidate's byte edge and
records a predecessor difference: TypeScript's predecessor checks the four
bounded inputs/copies locally, so it accepts that over-aggregate case. The
Rust semantic-work admission primitive accepts exactly 1,000,000 units and
refuses the next unit without another host meter call; this isolates the
counter edge and does not claim a complete operation-level work-budget match.
A crossed-control Rust probe confirms depth 129 refuses before charging that
node, while a byte-overlimit string is host-meter charged before its byte
refusal. These are scoped first-fault observations, not a complete matrix.

The current TypeScript `ValueWork` counter likewise accepts 1,000,000 units
and rejects the next unit. Existing package-level Node/Bun/Chromium receipts
use an older source closure and are not current package evidence. The
CONTRACT-058 duplicate identity and 0.8.0-governance/current-0.10.0-source
mismatch remain unresolved, so the adapter remains private; neither V4
default route nor the 922-gap ledger count changes.
