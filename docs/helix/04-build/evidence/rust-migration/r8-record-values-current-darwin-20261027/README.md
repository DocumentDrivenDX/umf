---
ddx:
  id: umf.evidence.rust-migration.r8-record-values-current-darwin-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-record-values
      kind: extends
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Record Values current-source installed-route evidence (Darwin)

This packet records one Darwin arm64 replay of the installed `@umf/core` package for operation `2.0.0` / core `0.10.0`, built from commit `e9ace728d2e8c0758b4723e3d1eef90b330ebe0d`. The exact archive is `/private/tmp/umf-security-not-current-darwin-20261027/archive/umf-sdk.tgz` (SHA-256 `accf61b39c4213ab452fbfff4fe1a31b950934a36c321c74984df45088adcd6c`). Its source closure is `a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25`; package version is `0.5.6`. The private archive itself is not copied here.

The frozen TypeScript packet contains 24 semantic cases and the host-admission packet expands to 19 raw-host cases. On Node `v26.12.1` and Bun `1.4.3`, all semantic outputs/refusals matched exactly on default and reference routes; each case made one default Rust dispatch and zero reference dispatches. All 19 host cases matched, with 20 default dispatches because the source→identity→values ordering case executes two probes. Getter/trap traces were checked on both routes, including both order probes, with no reads; reference dispatch remained zero. The resulting Record Values Rust dispatch count was 44 per runtime.

In real headless Chromium `153.0.8010.12`, the same 24 semantic and 19 raw-host cases matched exact frozen outcomes; default/reference bridge counts were 44/0 across those cases. The browser also retained 700,000 units of opaque extension content, and both default and reference routes rejected 100,001 values with `UmfError LIMIT`, message `JSON structural limit exceeded`, path `/99999`. The default browser bridge total was 46 including both resource controls. `process` and `Buffer` were absent from `globalThis`, and the installed WASM asset was requested. The browser used a harness-instrumented copy of the bundled glue; its hash is recorded in `chromium.json`, so the observed call count is bridge-level instrumentation rather than an addon call count.

## Reproduction and verification

Run the verifier against the exact archive and this checkout:

```sh
node docs/helix/04-build/evidence/rust-migration/r8-record-values-current-darwin-20261027/verify-packet.mjs --archive /private/tmp/umf-security-not-current-darwin-20261027/archive/umf-sdk.tgz --worktree "$PWD"
node docs/helix/04-build/evidence/rust-migration/r8-record-values-current-darwin-20261027/verify-packet.mjs --archive /private/tmp/umf-security-not-current-darwin-20261027/archive/umf-sdk.tgz --worktree "$PWD" --negative-controls
```

To replay installed routes, provide Node, Bun, Playwright and Chromium in the environment:

```sh
UMF_R5_WORKTREE="$PWD" UMF_R5_ARCHIVE=/private/tmp/umf-security-not-current-darwin-20261027/archive/umf-sdk.tgz sh docs/helix/04-build/evidence/rust-migration/r8-record-values-current-darwin-20261027/run-installed-replay.sh
```

The replay script outputs three fresh JSON receipts to stdout; it does not overwrite the captured raw receipts in this packet. A full sequential rerun completed for Node, Bun and Chromium, and each fresh output matched its captured JSON receipt exactly; [fresh-replay-comparison.json](fresh-replay-comparison.json) records that equality and the Chromium controls. The verifier checks pinned source commit/closure, archive and package pins, frozen packet identity and case counts, raw result counts and required dispatch/resource fields, and the packet checksum manifest. Its negative controls deliberately mutate each pinned value in memory and require rejection for stale archive, packet, source, and case-count claims.

This is Darwin arm64 evidence only. It does not qualify Linux, a two-platform release, the complete Rust port, production release/retirement, memory isolation, native storage enforcement, or any broader Record Values subset. The 700,000-unit control is a single retained-value test, not a memory bound.
