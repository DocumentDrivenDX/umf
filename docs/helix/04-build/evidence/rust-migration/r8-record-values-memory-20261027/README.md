---
ddx:
  id: umf.evidence.rust-migration.r8-record-values-memory-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-049
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-record-values-current-darwin-20261027
      kind: extends
---

# Record Values process memory observations

This opt-in packet measures the installed `@umf/core` 0.5.6
`validateCoreRecordValues` operation 2.0.0 from the pinned Darwin e9ace728d
archive. The archive SHA-256 is
`accf61b39c4213ab452fbfff4fe1a31b950934a36c321c74984df45088adcd6c`; the
shared source closure is
`a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25`.
Each scenario/repeat is a fresh Node or Bun process, warmed on the same
installed route. The full scenario input is constructed before the baseline
snapshot. Each record contains current RSS, JS heap used/total and process
high-water RSS at baseline and after the operation. Node and Bun report
`resourceUsage().maxRSS` in KiB on this Darwin cohort; `memoryUsage()` RSS and
heap values are bytes.

The two controls are:

- `retained-700k`: preserve the 700,000-unit opaque extension through the
  operation and assert the returned source still has that exact length.
- `refusal-100001`: refuse 100,001 input values with error code `LIMIT` at
  `/99999`.

The captured [raw JSONL](darwin-node-bun.jsonl) contains five successful fresh
processes per runtime and control (20 total). On Node 26.12.1, the baseline to
post-operation process high-water RSS increase was 53–58 MiB for retention and
216–239 MiB for the refusal control. On Bun 1.4.3 it was 63–297 MiB and
463–839 MiB respectively. `heapUsed` changed by -10–29 MiB (retention) and
196–248 MiB (refusal) on Node, and by 30–43 MiB and 210–237 MiB on Bun. Current
RSS before/after and heap-used/total snapshots are preserved per repeat in the
raw file. These observed ranges describe this exact local cohort only.

`SHA256SUMS` pins the measurement runner and raw JSONL receipts; verify them
from this directory with `shasum -a 256 -c SHA256SUMS`.

Run five repeats per runtime and scenario after any other build or memory-heavy
work has finished:

```sh
UMF_MEMORY_WORKTREE="$PWD" \
UMF_MEMORY_ARCHIVE=/private/tmp/umf-security-not-current-darwin-20261027/archive/umf-sdk.tgz \
sh docs/helix/04-build/evidence/rust-migration/r8-record-values-memory-20261027/run.sh \
  > docs/helix/04-build/evidence/rust-migration/r8-record-values-memory-20261027/darwin-node-bun.jsonl
```

Set `UMF_MEMORY_REPEATS` to change the repeat count. The runner refuses an
archive with a different SHA-256 and uses the installed package extracted from
that archive. `measure.mjs` also requires Darwin because this packet pins the
Darwin native addon and its observed `maxRSS` unit.

These are process observations, not a threshold or an upper-bound guarantee.
The high-water metric is cumulative process RSS: baseline and after values
allow comparison of the increase after the operation, but allocator startup,
GC and platform behavior remain in the measurement. Heap fields are snapshots
immediately before and after this synchronous operation; they do not claim an
operation-isolated heap peak. The run is one Darwin arm64 host and does not
qualify Linux or hosted CI. Chromium is omitted because browser-exposed heap
metrics cannot report an equivalent isolated process RSS plus WASM/native
allocator profile for this synchronous call. This packet does not close the
R8 measured memory qualification or make any retirement decision.
