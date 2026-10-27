---
ddx:
  id: umf.evidence.rust-migration.r8-csv-boolean-retirement-extension
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
    - id: umf.evidence.rust-migration.r8-csv-boolean-default-route-retirement-review
      kind: informed_by
---

# R8 CSV Boolean retirement extension

This packet extends the two-export private qualification for
`validateCsvBooleanLexical` and `verifyCsvBooleanLexical`. It adds a small
CONTRACT-053 oracle that does not derive expected values from the frozen R5
TypeScript packet: the four exact token-to-Boolean mappings, representative
refusal cases for mixed/upper case, whitespace, numeric spellings and a Unicode
confusable, absent/null refusal, and preservation of `unverified` provenance.
The finite unsupported-token representatives do not prove all possible token
strings. It checks that the receipt's Core Field verdict matches the separately
exported public `validateCoreFieldValue` operation for a Field that explicitly
allows only `false`.

Receipt verification independently alters original source, request, typed
Boolean, validation verdict, a required receipt member and an unexpected
operation member. A verification continuation proxy throws the same Error
object on a later expected-source reflection pass and asserts that expected
request reflection has not begun. A serialized receipt beyond the 4,000,000-byte
limit must refuse before any expected-source or expected-request reflection.

The installed replay runs the extension against the selected Node/browser roots
and the separate TypeScript reference in Node, Bun and real Chromium; the
browser must request the packaged WASM and must not expose Node globals. This is
private, bounded evidence for only these two exports. It does not change the R8
ledger, retire either logical row, qualify wider CSV ingestion, or constitute
SDK release qualification.

The checked-in replay passed 24 extension cases in Node 26.12.1, Bun 1.4.3
(Node compatibility version 26.3.0), and Chromium 153.0.8010.12. All three
matched default-root and TypeScript reference results. Chromium requested the
packaged WASM and had no Node globals. The source snapshot is revision
`4c3187be9`, with matching captured/live closure
`7870eee151f2633c48f49194e20f2bc590cbfabc62b80ef7abffeefa095e91f9` over 3,461
inputs and zero generated transforms. Archive SHA-256 is
`64e46f86bfb2ffbd97066d84d8a36cbd5a5cd48f45d6337a2400b4b4a79286ff`;
manifest SHA-256 is
`dff445c3e5e5bc46edf1d46b5bed46a92199c0db6f66a6673feb93c2114105cf`. Receipt
SHA-256 is `4e699c562157c1512380d39faa6298d3120f6bafd434eceeab3ab26390c35af6`;
harness SHA-256 is
`3f8745674fa9896bd3edd708e1f1fa21fb3c031c53d368a054a9d5e10245fd38`; cases
module SHA-256 is
`54f3ff4ffe2000c6454973074f9b2639692cea2c79fb1a50c7b59ffc7477943f`.
Neither this packet nor its archive retires ledger rows.

Reproduce from the repository root with the private archive path:

```sh
node scripts/rust-migration/r8/csv-boolean-retirement-installed.mjs \
  /private/tmp/umf-current-4c3187be9/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-retirement-extension/installed-replay-4c3187be9.json
```
