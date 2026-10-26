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
`validateCsvBooleanLexical` or `verifyCsvBooleanLexical` based on this bounded
qualification alone. The fresh private archive passes the 14-case frozen
packet and has zero outcome mismatches across the 18-case host-object corpus
in Node, Bun, and Chromium. Both retirement rows remain open pending the
broader retirement evidence and review; this decision applies only to these
two exports and does not change broader CSV or SDK claims.

## Authority and source route

CONTRACT-053 governs the explicit `umf.csv-boolean-lexical/1.0.0` profile and
public Core Field validation. The R5 predecessor packet freezes the exact
TypeScript outcomes for this operation pair. The current installed archive's
manifest declares Node `./dist/umf-node.js` and browser `./dist/umf-browser.js`
as package defaults, with `./dist/umf.js` as the separate reference route.
Source entries `src/index-node-v4.ts` and `src/index-browser-v4.ts` both bind
these names with `bindCsvBooleanLexicalRust`.

The fresh installed replay records a 3,431-file source closure with matching
captured/live hash
`83730261e84c90533a4cf2b5710550c92655f1f9519961e04e718a86187851e9`, zero
generated transform changes, and private archive SHA-256
`bdd14aa62e09df465d784bb7889c4d7ddfc79c61f8186acf6eb2423ce35e8b3b`.
Its manifest SHA-256 is
`a1ac69114b97dbd2220eed12538e2f5a5d46b8f72f7a1ab99810d035b822810d`.
This archive includes the metamodel bootstrap and measured-work Core Key tuple
test boundary; its evidence is exact for that captured snapshot. The frozen predecessor SHA-256 is
`b960bac93d6027b03808bb984381e0c78cc78f91b3e5d1012faf539ec3890470`.

## Passing bounded evidence

[`installed-replay-20261025.json`](installed-replay-20261025.json) reports all
14 frozen cases equal through the installed default route in Node 26.12.1,
Bun 1.4.3, and real Chromium 153.0.8010.12. The cases cover all four lexical
tokens, allowed-value and unknown selected semantics, invalid
field/token/request behavior, staged receipt verification and getter ordering,
plus exact and over-limit 4,000,000-byte input/receipt boundaries. Chromium
requested the packaged WASM. Missing and corrupt native addons refused in Node
and Bun. The baseline installed harness hash is
`00b32f2b7034942107120f087df500500c9d82a3d1405216b92fad6f0bbc4ebd`.

The [comparative adversarial receipt](adversarial-replay-20261025.json) and
[replay harness](adversarial-replay-20261025.mjs) compare both installed roots
in all three environments over 18 cases. Single source and request accessors,
single non-enumerable members, invalid-request/source-accessor precedence,
ordinary proxy trap exceptions, changing proxy key lists, and malformed
receipt-first verification match. Accessor getters stay uncalled. In matching
single-member cases, each route returns an error that is an instance of its
own exported `UmfError`.

All 18 cases have zero outcome mismatches in Node, Bun, and Chromium. The
changed admission path preserves the reference's operation-local root for
symbol keys and precise offending-member paths for competing invalid members.
It snapshots descriptors once per member pass, so a changing proxy descriptor
is read once. Proxy reflection order is exactly `ownKeys, ownKeys,
descriptor:umf`; changing key lists are reflected twice and refuse at `/id`.
The receipt records every outcome and trap observation for each runtime. Its harness SHA-256 is
`38a12999a7e8957bc5cffea961a08c43c1df319cea41d61a025f042b2406b6c8`; the
updated receipt SHA-256 is
`6bebf6780e32f09de0eaee450faf9266c1af2bf99ab21cccd519a5cbf67b77b2`.
The comparison remains bounded to these 18 shapes and does not exhaustively
qualify all proxy behaviors or host objects. Focused shared-wire negative
controls separately cover a second-snapshot symbol, `__proto__` data key, and
receipt-before-input ordering.

## Reproduction

The installed archive replay was run with Bun 1.4.3:

```sh
bun scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs \
  /private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/installed-replay-20261025.json

bun docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/adversarial-replay-20261025.mjs \
  /private/tmp/umf-r8-csv-admission-20261025/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/adversarial-replay-20261025.json
```

The archive is private and non-publishable. This review does not retire either
CSV row or change the shared migration ledger, plan, metamodel, or resource
mirrors.
