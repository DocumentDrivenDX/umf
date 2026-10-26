---
ddx:
  id: umf.evidence.rust-migration.r8-csv-boolean-default-route-retirement-review
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
    - id: umf.evidence.rust-migration.r8-csv-boolean-default-route
      kind: informed_by
---

# R8 CSV Boolean default-route retirement review

## Decision

Do not retire the TypeScript default semantics for either
`validateCsvBooleanLexical` or `verifyCsvBooleanLexical` yet. The installed
archive qualifies a bounded 14-case semantic corpus for both selected Rust
routes, but independent host-object admission exposes an observable request
accessor mismatch. The two retirement rows therefore remain open pending a
reviewed host-boundary correction and fresh installed replay. This decision
applies only to these two exports and does not change broader CSV or SDK claims.

## Authority and source route

CONTRACT-053 governs the explicit `umf.csv-boolean-lexical/1.0.0` profile and
public Core Field validation. The R5 predecessor packet freezes the exact
TypeScript outcomes for this operation pair. The current installed archive's
manifest declares Node `./dist/umf-node.js` and browser `./dist/umf-browser.js`
as package defaults, with `./dist/umf.js` as the separate reference route.
Source entries `src/index-node-v4.ts` and `src/index-browser-v4.ts` both bind
these names with `bindCsvBooleanLexicalRust`.

The installed replay receipt records the same 3,426-file source-closure hash
before and after packaging (`1a28de92f1c2e0f51a0b9b2c63bb55afa202057096e2cc399feaa638a994f39f`),
fixed-point transforms, and private archive SHA-256
`3d2c6b3b154ff3ffc45d63919eee4572b491f242bea3976289c34f9cb63ceffc`.
The frozen predecessor SHA-256 is
`b960bac93d6027b03808bb984381e0c78cc78f91b3e5d1012faf539ec3890470`.

## Passing bounded evidence

`installed-replay.json` reports all 14 frozen cases equal through the installed
default route in Node 26.12.1, Bun 1.4.3 and real Chromium 153.0.8010.12. The
cases cover all four lexical tokens, allowed-value and unknown selected
semantics, invalid field/token/request behavior, staged receipt verification
and getter ordering, plus exact and over-limit 4,000,000-byte input/receipt
boundaries. It also records that missing and corrupt native addons refuse in
Node and Bun. The harness hash is
`00b32f2b7034942107120f087df500500c9d82a3d1405216b92fad6f0bbc4ebd`.

The additional review replay
[`csv-boolean-retirement-reference.mjs`](../../../../../../scripts/rust-migration/r8/csv-boolean-retirement-reference.mjs)
imports both installed package roots directly. In Node 26.12.1 and Bun 1.4.3,
the reference root matches the frozen predecessor on the 12 non-large-boundary
cases; the receipt's independent installed replay covers the other two boundary
cases in all three environments. The new replay adds accessor-bearing source
and request shapes and asserts that getters stay uncalled.

For an enumerable getter at source `umf`, both roots return
`UmfError/NON_JSON` at `/umf`, with zero getter calls. For an enumerable getter
at request `profile`, the reference returns
`UmfError/NON_JSON` at `/profile`; the Rust default returns
`AdmissionError/ACCESSOR_PROPERTY` at `/csvRequest`. Both leave the getter
uncalled. The mismatch reproduces in Node and Bun.

Sol's separate installed Node probe found the same boundary divergence for
additional adversarial properties: a source `id` accessor produced Rust
`NON_JSON` at `/umf` versus reference `NON_JSON` at `/id`; a nested source
accessor produced Rust `AdmissionError/ACCESSOR_PROPERTY` at
`/source/modules/0/elements/0` versus reference `UmfError/NON_JSON` at
`/modules/0/elements/0/name`; request `token` and unknown-field accessors
produced Rust `AdmissionError/ACCESSOR_PROPERTY` at `/csvRequest` versus
reference `UmfError/NON_JSON` at `/token` or `/future`. Those getters also
stayed uncalled.

The existing Chromium replay exercises the Rust-selected default root against
the frozen packet, and confirms the separate reference export is present. It
does not compare the reference root's semantics in Chromium, and the new
adversarial reference/default comparison is Node and Bun only. Browser parity
for accessor-bearing host objects remains untested.

## Reproduction

The reference and adversarial comparison was run with Bun 1.4.3:

```sh
bun scripts/rust-migration/r8/csv-boolean-retirement-reference.mjs \
  /private/tmp/umf-r8-csv-boolean-default/umf-sdk.tgz
```

The script hash is
`6e3b8a0e94ee369b10900f52e121828eb07719363beca28f2431c13990909f3c`.
Its Node and Bun subprocesses both completed with the expected single
adversarial mismatch and verified every frozen case it replays. No implementation
or ledger files were changed for this review.
