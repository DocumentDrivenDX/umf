---
ddx:
  id: umf.evidence.rust-migration.r8-csv-boolean-default-route
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-csv-boolean-default-route
      kind: informed_by
---

# R8 installed CSV Boolean default-route qualification

This packet is scoped to `validateCsvBooleanLexical` and
`verifyCsvBooleanLexical` from the package's default Node and browser roots.
It exercises the installed package root against all cases in the frozen R5
TypeScript predecessor packet, including receipt-first getter behavior and the
4,000,000-byte input and receipt limits. Node 26, Bun 1.4, and real Chromium
are required. It also checks the package's Node/browser/reference condition
map and missing/corrupt Node addon refusal. A pass would qualify only these two
installed default-route operations for this archive; it would not close the
wider CSV adapter, full TypeScript retirement, or release gates.

The installed replay is
[`scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs`](../../../../../../scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs).
The archive wrapper rechecks the builder's captured source closure and writes
only to the requested temporary output path:
[`scripts/rust-migration/r8/csv-boolean-default-route-package.py`](../../../../../../scripts/rust-migration/r8/csv-boolean-default-route-package.py).

The captured archive is at
`/private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz`.
Replay that exact artifact from the repository root with:

```sh
bun scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs \
  /private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/installed-replay-20261025.json

bun docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/adversarial-replay-20261025.mjs \
  /private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/adversarial-replay-20261025.json
```

The archive was built with Rust 1.90.0 and wasm-bindgen 0.2.100 on macOS
arm64. The canonical builder's final Bun directory copy hit sandbox `clonefile`
EPERM, so a one-run temporary builder copy used `/bin/cp -R` for staging; the
captured source closure still hashed the unchanged canonical builder. The
temporary helper and worktree dist were removed after packaging. The package
wrapper verified the fixed-point closure before archiving; later checkout
changes mean that exact source closure is no longer the live tree.

## Current result

The fresh private archive's [installed replay](installed-replay-20261025.json)
passes all 14 frozen predecessor cases through Node 26.12.1, Bun 1.4.3, and
real Chromium 153.0.8010.12. It covers both lexical operations, unknown
selected semantics, receipt-first expected-source getter ordering, exact and
over-limit 4,000,000-byte inputs and receipts. Node/Bun resolve the default to
`dist/umf-node.js`; Chromium resolves it to `dist/umf-browser.js`; all three
load the separate TypeScript reference at `dist/umf.js`. Chromium requested
the packaged WASM. Missing and corrupt native addons refused in both Node and
Bun.

The archive SHA-256 is
`bdd14aa62e09df465d784bb7889c4d7ddfc79c61f8186acf6eb2423ce35e8b3b`;
the archive manifest SHA-256 is
`a1ac69114b97dbd2220eed12538e2f5a5d46b8f72f7a1ab99810d035b822810d`.
The builder and package wrapper independently checked 3,431 source files at
`83730261e84c90533a4cf2b5710550c92655f1f9519961e04e718a86187851e9`;
captured and live hashes match and generated transforms changed zero inputs.
This archive includes the metamodel bootstrap and the measured-work Core Key
tuple test boundary. The manifest marks the archive
`private-r7-default-route-qualification-not-publishable`; it is not a release
artifact.

The [comparative adversarial replay](adversarial-replay-20261025.json) and its
[harness](adversarial-replay-20261025.mjs) compare default and reference
outcomes in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 across 18
cases. All three environments have zero outcome mismatches. This includes
symbol roots, competing invalid members, changing proxy descriptors, key-list
changes, trap order/counts, accessor non-invocation, and malformed-receipt-first
verification. Symbol roots return `UmfError/NON_JSON` at the operation-local
root; competing hidden/accessor members preserve the reference pointer; a
changing key proxy reflects twice and refuses `/id`; and a stable proxy's
traps are exactly `ownKeys, ownKeys, descriptor:umf`. The separate focused
shared-wire tests also cover a late symbol returned by the second `ownKeys`
snapshot and a `__proto__` data key.

These receipts qualify only the two selected operations in this archive. The
18 adversarial shapes are a bounded corpus, not an exhaustive proxy or host
object proof. The wider CSV adapter, all 922 default-route retirement
decisions, and the publishable SDK release remain outside this qualification.
No retirement decision is made by this bounded correction; the
[retirement review](retirement-review.md) keeps both CSV Boolean rows open.
