---
ddx:
  id: umf.evidence.rust-migration.r8-core-kind-nullability-candidate
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-kind-nullability
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-kind-nullability-default-route
      kind: informed_by
---

# R8 Core Kind and Nullability batch candidate

## Candidate and decision

The candidate is the six-operation family `inspectCoreElementKind`,
`declareCoreElementKind`, `verifyCoreKindDeclaration`,
`inspectCoreNullability`, `declareCoreNullability`, and
`verifyCoreNullabilityDeclaration`. The current R8 ledger contains six unique
executable declarations and twelve default Node/browser route rows for these
names. Each remains an inherited TypeScript default implementation with an
accepted Rust operation mapping. No source selection, retirement, installed
SDK qualification, or release is claimed here.

The existing staged host-input implementation is the correct admission shape:
JavaScript supplies opaque handles, Rust copies source before identity, checks
declaration requests without traversing invalid objects, and verifies a receipt
before reading `current`. One retained runtime owns immutable resources and the
prepared operation schemas; each call receives a fresh `Context`. The process
global schema cache was removed because it made later factory setup accounting
depend on earlier factories.

Do not connect this factory as a second eager runtime in either V4 root. The
current `createCoreModelRootEngine` facade snapshots JavaScript resources but
calls stateless `executeRequestWire` for each operation; it does not expose the
same retained Rust `Engine`. A separate Kind/Nullability runtime would therefore
admit the five resources a second time. The old three-call local sample measured
3.17 seconds of factory setup and about 15.7 times TypeScript call latency. A
fresh five-round diagnostic below measures lower setup on this host, but still
shows a large warm-call regression. This family remains opt-in.

Safe sharing needs a retained model runtime that owns one per-instance Rust
`Engine` and the prepared Kind/Nullability schemas, then exposes both the
existing model request dispatcher and the staged opaque-handle dispatcher over
that same engine. Refactor `executeRequestWire` handling so the retained runtime
can dispatch model requests against its owned engine. Keep the staged operation
admission order and fresh per-call `Context` unchanged. Charge resource
reflection, wire decode, `Engine` construction and schema preparation to that
runtime's factory context. Do not use a process-global cache. The existing
generic model call path also carries callback/registry and control behavior;
those must remain ordered and scoped exactly as before when moved onto the
retained runtime. This implementation decision is reviewable but does not prove
that the wider retained dispatcher is currently equivalent.

## Current checks and limits

The R5 source parity script passes six complete operation envelopes and ten
host-order/resource negative controls under Bun's Node compatibility runtime.
Its exact current command is `bun
scripts/rust-migration/r5/kind-nullability-default-route/host-json-parity.mjs`.
The Node 26.12.1 replay compared all eleven success envelopes and thirteen
frozen refusal envelopes against the frozen TypeScript packet. Real Chromium
replayed six operations and nine negative controls with the staged WASM facade.
The captured tool outputs are summarized in [`matrix.json`](matrix.json).

These are not one coherent current-source build. The workspace Node addon
(`bea74550ee1c8a6472109c56d9cbd95687b8567a67595443026aa68d9cb62cd1`) predates
the current Node host binding source. The Chromium harness loads the retained
`/private/tmp/umf-kind-wasm-fresh/pkg` artifact from October 24, predating the
current WASM host binding source. The current source pins and artifact hashes
are kept separate in the matrix receipt. A source-coherent rebuild and private
installed-package replay remain required.

The focused Rust test passed all six tests with the pinned Cargo 1.90 toolchain
and an isolated target directory. Earlier R5 focused Rust tests and independent
review remain valid only for their recorded source cohorts. The matrix also
does not qualify other operating systems or architectures.

## Performance gate

The new diagnostic runs five alternating TypeScript-first/Rust-first rounds
with thirty calls per route, reporting setup separately from warm calls. Bun
1.4.3 on Darwin arm64 measured median setup 600.46 ms and median warm Rust call
5.591 ms; median TypeScript call was 0.164 ms. Node 26.12.1 measured median
setup 664.71 ms, median warm Rust call 6.219 ms, and median TypeScript call
0.278 ms. The corresponding round p95 values and every raw round are in
[`performance.json`](performance.json). These local diagnostic medians are
approximately 34.1× and 22.4× slower respectively. They are not cross-host
release benchmarks, but they fail the current default-route performance gate.

The existing read-only profile attributes most operation time to recursive
constraint evaluation during source validation. Its static dispatch proposal
estimates at most a modest improvement and explicitly requires re-profiling;
it is not a sufficient fix for this measured gap. No production optimization
was attempted in this candidate.

## Reproduction

```sh
bun scripts/rust-migration/r5/kind-nullability-default-route/host-json-parity.mjs
node scripts/rust-migration/r8/core-kind-nullability/node-frozen-parity.mjs
bun scripts/rust-migration/r5/kind-nullability-default-route/host-json-browser.mjs
bun scripts/rust-migration/r8/core-kind-nullability/default-route-benchmark.mjs
node scripts/rust-migration/r8/core-kind-nullability/default-route-benchmark.mjs
```

The Chromium replay requires the recorded loopback permission and uses the
existing staged WASM artifact. Its `freshWasm` field is a harness label for a
new browser instance, not a fresh build: the artifact itself is from October 24
and must be rebuilt from the frozen source before any installed or default-route
claim. This candidate changes neither V4 root, package exports, route inventory
nor gap ledger.
