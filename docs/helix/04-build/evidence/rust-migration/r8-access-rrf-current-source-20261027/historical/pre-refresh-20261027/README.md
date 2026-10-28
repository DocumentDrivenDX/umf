---
ddx:
  id: umf.evidence.rust-migration.r8-access-rrf-current-source-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-074
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-postgres-search-rrf-20261027
      kind: informed_by
---

# R8 opt-in PostgreSQL search RRF CLI replay

This packet is reserved for a source-bound replay of the five pure scoring
cases selected from the frozen nine-case Python `_finish` predecessor. Run
`node scripts/rust-migration/r8/replay-access-rrf-cli.mjs ABSOLUTE_UMF_CLI`
from the repository root after building the final-source `umf` executable.
The replay sends the tagged `access.rrf.score` operation using profile
`umf-r8-access-rrf/0.1.0`. It assigns dense identities from exact frozen key
tuples and supplies the Python-sorted complete-key order for ties. Results are
compared by ordered identity and binary64 bit pattern.

The selected cases are `rrf-overlap-rank-accumulation-and-topk`,
`rrf-complete-key-tie-order`, `rrf-equal-key-items-use-python-equality`,
`rrf-empty-legs`, and
`rrf-oversized-positive-constant-dsl-admits-python-overflows`. The last case
must preserve Python's admitted-constant overflow as `RRF_CONSTANT_OVERFLOW`
with the predecessor message. Controls cover malformed wire, bad profile,
bad operation, work refusal, deadline refusal, identity bound refusal, and a
three-identity non-involutive key-order control.

The four other frozen predecessor cases remain host-only: single-leg native
score preservation and truncation; no-fusion arity refusal; divergent-row
equality refusal and its error precedence; and target-defined fusion refusal.
The RRF scorer does not claim those Python admission, row-equality, artifact
access or native-score behaviors.

## Python installed-wheel replay

The [Python receipt](python-installed-replay.json) records current-source
`umf-core` and `umf_access` wheels installed together in CPython 3.13.16 on
macOS arm64, both package import origins, source and artifact hashes, and the
full frozen nine-case facade replay with no source-path import override. The five
Rust-scored cases and four host-owned/delegated cases all match the predecessor,
including exact `float.hex()` values and the oversized-constant
`OverflowError`. The profile also passes focused host-bound and control-forwarding
checks. This is one private local installed-wheel cohort; it does not qualify
PostgreSQL execution, another platform, default routing, or release behavior.

## Node, Bun, and Chromium source replay

The [Node](node.json), [Bun](bun.json), and [Chromium](chromium.json) receipts each pass five scoring cases: the four frozen pure-result cases listed above plus a three-identity non-involutive key-order permutation control. The tie order is supplied as identities in complete-key sort order. Each host compared ordered identities and exact binary64 score bits; Chromium loaded the shared build’s pinned WASM artifacts. These source-built replays share `/private/tmp/umf-r8-current-source-securitynot-20261027/compact-dataset-verify-build-manifest.json` (SHA-256 `c48aa7bfe8f65129cdaa1c4fa49c6a0c579d3aed970e410d99dcb1b1189312ff`; source closure SHA-256 `86192c24ea6310ccb7d50e9e78045bb928900fe1876b878a244bfd4832e1fa4a`). The Node and Bun harnesses loaded an exact source copy with the build’s Node addon; Chromium loaded its WASM glue and binary. Each receipt pins the nine-case predecessor packet SHA-256 `3e4467f63ff324c35fe4b46824a75d830608a03bf3ee08f722e85ddc370243a1`. This qualifies only these source-built hosts and cases; it does not establish installed SDK behavior, default SDK routing, PostgreSQL execution, or release behavior.

The raw Node/Bun harness records its actual runtime identity and the frozen
predecessor packet hash; the Chromium harness records its browser identity,
user-agent, packet hash, and WASM artifact hashes. Refresh raw receipts by
running the Node harness once with Node and once with Bun, then the Chromium
harness against the shared build's WASM package. The durable
[`build-access-rrf-receipts.mjs`](../../../../../../scripts/rust-migration/r8/build-access-rrf-receipts.mjs)
builder verifies the complete source closure and all six artifact files against
the build manifest, checks the exact Node/Bun/Chromium pins and packet SHA-256,
and refuses to replace an existing output directory. Its tests reject swapped
hosts, changed source or artifact bytes, a changed predecessor packet, and
runtime/browser substitutions. It validates receipt inputs; it does not execute
the runtimes or claim an archived capture.

The current harness comparison reports the five-case count and an empty
mismatch list. It does not yet serialize each observed ordered score fingerprint
into the raw receipt; the harness source hash pins the comparison implementation
for this scoped evidence.

## Source and binary identity

The prior host receipts are retained under [`historical/pre-securitynot-contract062-refresh-20261027/`](historical/pre-securitynot-contract062-refresh-20261027/); the superseded build4 cohort remains under [`historical/pre-build5-generated-manifest-refresh-20261027/`](historical/pre-build5-generated-manifest-refresh-20261027/).

The source-bound [CLI receipt](receipt.json) pins the Rust 1.90.0 build,
executable hash, direct CLI/RRF source inputs, predecessor packet, and replay
script. The replay passes the five selected predecessor cases with exact
binary64 bits, six protocol/scoring operations, six refusal controls, and the
three-identity non-involutive tie-order control. Four host-only predecessor
cases remain outside this CLI scorer. Rust owner, PostgreSQL execution,
installed-package behavior, default routing, and release qualification remain
separate.
