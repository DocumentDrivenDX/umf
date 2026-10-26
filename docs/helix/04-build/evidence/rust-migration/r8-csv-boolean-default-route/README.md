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

After the source cohort is settled, run from the repository root with Rust
1.90.0 and wasm-bindgen 0.2.100 on macOS arm64:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin \
UMF_RUST_DEFAULT_BUILD_ONLY=1 \
UMF_RUST_DEFAULT_DIST=/private/tmp/umf-r8-csv-boolean-default/dist \
bun scripts/package-sdk-rust-default.ts

python3 scripts/rust-migration/r8/csv-boolean-default-route-package.py \
  /private/tmp/umf-r8-csv-boolean-default/dist \
  /private/tmp/umf-r8-csv-boolean-default/umf-sdk.tgz

bun scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs \
  /private/tmp/umf-r8-csv-boolean-default/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/installed-replay.json
```

## Current result

The private archive [installed replay](installed-replay.json) passes all 14
frozen predecessor cases through Node 26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12. This includes both lexical operations, unknown selected
semantics, receipt-first expected-source getter ordering, exact and over-limit
4,000,000-byte inputs and receipts. The installed route resolves to
`dist/umf-node.js` in Node/Bun and `dist/umf-browser.js` in Chromium; the
reference route resolves separately to `dist/umf.js`. Chromium requested the
packaged WASM artifact. Missing and corrupt native addons refused in both
Node and Bun.

The archive SHA-256 is
`3d2c6b3b154ff3ffc45d63919eee4572b491f242bea3976289c34f9cb63ceffc`;
the manifest SHA-256 is
`b6557028f549a867449fd13dd707474e2ad1949ab6e7d683f224ea6d4d82f948`.
The builder and package wrapper independently checked a 3,426-file source
closure at
`1a28de92f1c2e0f51a0b9b2c63bb55afa202057096e2cc399feaa638a994f39f`.
Generated transforms were a fixed point with zero changed inputs. The
archive is marked `private-r7-default-route-qualification-not-publishable`.

The packet is JSON, so the harness compares canonical JSON content rather
than object prototype identity. Sol separately imported the archive's Rust
default and TypeScript reference roots in Node. Accepted receipt, source,
request, validation, field and source-context objects all had null
prototypes in both routes; an unsupported-token error was `UmfError`, an
instance of each route's exported `UmfError`, with code
`CSV_BOOLEAN_LEXICAL` and an empty path. This is a selected shape check, not
an exhaustive host-behavior proof.

The first build refused a concurrent source change; another produced a
derived private snapshot because generated files had not been refreshed after
the Avro edit. Both were discarded before packaging. The final build followed
the metamodel and action-identity fixed point. This receipt qualifies the
two installed operations in this exact private archive, not the broader CSV
adapter, all 922 default-route retirement decisions, or a publishable SDK
release. The explicit retirement decision remains open.

The [independent retirement review](retirement-review.md) compared the
installed default against the installed TypeScript reference and found a
request-accessor error mismatch, so neither CSV Boolean declaration is
retired. A subsequent source-level CSV facade correction recovers the
predecessor `NON_JSON` child path for one unambiguous accessor or hidden
property without calling getters. Focused Bun tests cover source and request
properties plus receipt-first behavior. The private archive above predates
that correction; its Node/Bun/Chromium installed results cannot qualify the
new source. Multiple hidden members, exotic proxy traps, competing invalid
values, and the new source in an installed browser package remain open.
