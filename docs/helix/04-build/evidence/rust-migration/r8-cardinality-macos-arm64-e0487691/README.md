---
ddx:
  id: umf.evidence.rust-migration.r8-cardinality-macos-arm64-e0487691
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R8 macOS arm64 Core Cardinality installed replay — e0487691

This packet records a private SDK archive built from clean committed source
`e0487691e34be22de9e63d8ead5f1c9db21fee13` on macOS arm64. The SDK builder
reported 3,550 source-closure files, fixed-point generated inputs (zero
transforms), and source/captured-live closure SHA-256
`1355bf21b58ad9e422fa8998c1ce5325b8643bb1eefbc6a1b6a127babc52b5d7`. That
closure matches the separately reported Linux e048 cohort; this packet itself
records only the macOS arm64 run.

The private SDK archive is at
`/private/tmp/umf-r8-cardinality-macos-arm64-e0487691e34be22de9e63d8ead5f1c9db21fee13/qualification/umf-sdk.tgz`;
it is intentionally omitted from this repository packet. Its exact SHA-256 is
`b87fe222f8e6f0c2446e54d683b22e8cec3ebdeca8fb75e4a5a82f2aa1ea3235`, size is
43,823,259 bytes, and its archive-manifest SHA-256 is
`6e3fb61b5fb4b7857d85f79eecaee90fecd3ea49343740e5411239568369a513`. The
[archive manifest](archive-manifest.json) contains the per-member digests; the
[source closure summary](source-closure-summary.json) records the captured
source identity and bounded builder metadata. The complete builder manifest
SHA-256 is `6985eb30cb5753061e7712221305f5f6191ffc6b58306fbd427ea48f4a192a1d`;
it remains with the private qualification files rather than duplicating its
3,550-input hash map here.

The unmodified [installed replay receipt](installed-cardinality-receipt.json)
reports `pass` for `inspectCoreCardinality`, `declareCoreCardinality`, and
`verifyCoreCardinalityDeclaration` on Node 26.12.1, Bun 1.4.3 and headless
Chromium 153.0.8010.12. Installed/reference and frozen predecessor results,
host admission/order, Proxy trap traces, caller-thrown error identity, and
public `UmfError` shapes matched across hosts. Chromium loaded packaged WASM
with zero external requests. Full typecheck passed in the isolated source
checkout after the build-generated wasm-bindgen package was copied into its
ignored package path. Environment versions are listed in
[environment.json](environment.json).

## Reproduction

Run from a separate clean e048 checkout. Keep all build and replay outputs in
that disposable checkout/private temporary directory; compare the resulting
receipt with this packet rather than writing into this reviewed packet.

```sh
REPO=/private/tmp/umf-r8-cardinality-macos-arm64-e0487691-repro/source
COMPACT_OUT=/private/tmp/umf-r8-cardinality-macos-arm64-e0487691-repro/compact/dist
ARCHIVE=/private/tmp/umf-r8-cardinality-macos-arm64-e0487691-repro/umf-sdk.tgz
RECEIPT=/private/tmp/umf-r8-cardinality-macos-arm64-e0487691-repro/installed-cardinality-receipt.json

mkdir -p "$(dirname "$REPO")"
git clone --no-hardlinks /Users/erik/.codex/worktrees/rust-binding-spike/umf "$REPO"
git -C "$REPO" checkout --detach e0487691e34be22de9e63d8ead5f1c9db21fee13
cd "$REPO"
bun install --frozen-lockfile

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
WASM_BINDGEN=/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen TMPDIR=/private/tmp \
bun scripts/rust-migration/r8/compact-dataset-verify-v4-source-replay.mjs --build "$COMPACT_OUT"
mkdir -p bindings/core/wasm/pkg
cp "$COMPACT_OUT/wasm/umf_core_wasm.js" "$COMPACT_OUT/wasm/umf_core_wasm.d.ts" "$COMPACT_OUT/wasm/umf_core_wasm_bg.wasm" bindings/core/wasm/pkg/
bun run typecheck

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
WASM_BINDGEN=/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen TMPDIR=/private/tmp \
bun run build:sdk
cp .cache/sdk-distribution/umf-sdk.tgz "$ARCHIVE"
bun scripts/rust-migration/r8/core-cardinality-installed.mjs "$ARCHIVE" \
  1355bf21b58ad9e422fa8998c1ce5325b8643bb1eefbc6a1b6a127babc52b5d7 "$RECEIPT"
```

A fresh archive may differ bytewise because the Rust/WASM build embeds a
temporary source path. Compare its source closure, fixed-point status, member
inventory and case outcomes against this packet; the exact archive and receipt
digests above identify the preserved original run. A fresh run requires local
loopback HTTP for Chromium and the pinned Rust/WASM tools. The source checkout,
archive, and replay output are private qualification artifacts; no publish step
is part of reproduction.

## Limits and open gates

This is one local Darwin arm64 archive cohort and a focused installed replay of
three operations. It does not claim the complete SDK behavior, five-binding
TableSpec/PostgreSQL/SQL Server/Avro/Parquet acceptance, complete CONTRACT-040
acceptance, Linux hosted CI, all source-authority closure, retirement of any
ledger row, native semantic equivalence, release readiness or support expansion.
The SDK manifest remains private/nonpublishable. The archive is private and
must be retrieved by its recorded digest for installed replay.

The current implementation still has a TypeScript host-admission step before
Rust dispatch; this packet does not independently establish removal of that
step. See the [R8 migration plan](../../../rust-migration-plan.md#r8-cardinality-acceptance-and-retirement-gate-audit--2026-10-27),
[CONTRACT-040](../../../../02-design/contracts/CONTRACT-040-core-ideals.md), and
the prior [final installed replay packet](../r8-cardinality-final-installed/README.md)
for the governing gate and related evidence.
