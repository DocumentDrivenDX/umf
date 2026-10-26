---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.record-type-default-route-20261026
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-record-type
      kind: informed_by
---

# Core Record Type v6 V4 source route

The V4 Node and browser entries now select the retained Rust Record Type v6
declaration and staged verification operations. The binder copies the Field
author before the Record author. Verification copies the receipt, prepares the
Rust stage, then copies the current document and finishes; a current-copy or
finish failure discards the stage while preserving the original error. The
reference entry remains the TypeScript predecessor.

The strict unified-client checker scans every `src/access` file. The new
Record Type facade has exact per-file import grants; its predecessor
declaration modules are type-only. Negative tests reject newly introduced
imports, a value import or re-export from the predecessor, and host hooks.
The checker and nine boundary tests pass. Binder and frozen predecessor tests
pass four tests and 33 assertions. Typecheck passes.

A direct Bun 1.4.3 import of `src/index-node-v4.ts` matched the three frozen
declaration and three verification cases, refused a malformed receipt before
reading a Proxy current document, and mapped the native refusal to `UmfError`.
The [reproducible Chromium runner](../../../../../../scripts/rust-migration/r8/record-type-default-chromium.mjs)
builds WASM from the current Rust source with Rust 1.90.0 and wasm-bindgen
0.2.100, bundles the live V4 browser entry with fresh glue, and replays the
same three cases in Chromium 153.0.8010.12. The
[receipt](record-type-default-chromium.json) records six exact predecessor
matches, `CORE_RECORD_TYPE_RECEIPT` before zero current Proxy traps (including
`getPrototypeOf`, `ownKeys`, descriptor and property reads), zero page
errors, zero external requests, and no Node globals. Its source closure SHA-256
is `4b15d1db73cd293dd48f6708ab6937678b1c457fe4f75ec50c69ebbcd6f3eb4a`
over 1,865 inputs; independent hash recomputation passed. The runner SHA-256
is `23739033ccd08cace3f310f8eb0e2709f44ee5df8e21e5321a841587f721d920`.

This is a source-route qualification for the stated subset. Installed SDK
packaging, other hosts, broader semantic and host parity, operation retirement,
and release qualification remain open.
