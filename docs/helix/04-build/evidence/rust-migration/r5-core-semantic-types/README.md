---
ddx:
  id: umf.evidence.rust-migration.r5-core-semantic-types
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# R5 core semantic type operations

This opt-in Rust module implements `inspectCoreSemanticTypes`,
`getCoreSemanticTypes`, `declareCoreSemanticTypes`, and
`verifyCoreSemanticTypeDeclaration` from active CONTRACT-078. It retains source
and unknown JSON members, requires exact identities and core 0.10.0 for typed
read/authoring, blocks edits to unknown qualifiers, and recomputes declarations
before accepting receipts. Semantic vocabulary resolution, interim extension
APIs, bindings, and default route changes are not included. Registry lookup and
semantic value validation have separate companion evidence in
`r5-semantic-type-registry` and `r5-semantic-value`.

[`frozen-typescript.json`](frozen-typescript.json) records 15 TypeScript
predecessor cases from Bun 1.4.3 and pins the direct implementation, validation,
schema, and core resource files. All 13 pinned predecessor files match the
captured SHA-256 values. The Rust replay compares complete inspection
and declaration envelopes, copied reads, clear refusal details, receipt
recomputation, schema-first malformed receipt refusal, old-version document
refusal, validation-order errors for invalid identity/request inputs, and a
schema-valid receipt whose recomputation must preserve an unknown-qualifier
refusal. Verification propagates recomputation errors and nested meter or
cancellation failures without converting them to malformed-receipt errors.
Receipt verification compiles and checks the versioned operation schema before
recomputation. Source/target copies, diagnostic conversion, element scans,
semantic reference checks, canonical receipt sorting/comparison, and final
receipt copies charge the shared `Context`; the focused suite checks the
invocation meter and cancellation hooks.

The focused Rust replay passed:

- `cargo test -p umf-core --test r5_core_semantic_types --offline`: 2 tests
  passed with the repository-pinned Rust 1.90.0 toolchain.

This is core-only opt-in evidence. CONTRACT-078 describes `inspect` returning
an opaque `legacy` meaning for older core versions, but the current TypeScript
implementation validates the document against core 0.10.0 first, and the
2.0.0 operation schema restricts `source` to core 0.10.0. The frozen 0.9.0
cases therefore return `SEMANTIC_TYPE_DOCUMENT` before the typed-version guard;
the older-core `legacy` case is an upstream contract/source gap and is not
claimed here. Independent Sol re-review, Node/Python/browser/WASM or wire routes,
maximum-budget and allocation-failure boundary studies, and production/default
cutover remain open. Registry/value semantics remain unfinished.

Independent Sol re-review of the four final pinned files checked the complete
Rust operation flow against `src/model/semantic-types.ts`, the versioned receipt
schema, and the 13-source predecessor closure. The prior recomputation error
conversion is gone: a schema-valid receipt now propagates the frozen
`SEMANTIC_TYPE_UNKNOWN` refusal, and a nested meter failure propagates without
becoming `SEMANTIC_TYPE_RECEIPT`. Sol reran the focused Rust suite independently
(2/2), checked all 13 predecessor hashes, and ran `bun run typecheck` after the
unrelated R5 freezer annotation repair. No P1/P2 remains in the bounded four
core operations. The allocation and maximum-budget studies above remain open;
this review does not extend to the remaining semantic-type APIs or host routes.

SHA-256 pins:

- Rust core module: `60558611dbd5c966cd54990c262b6ad7f2dfefec78e58757a9f77ca30d186453`
- focused Rust test: `b4fa897f06f277708da9e68d4041b259edf91ab4f83bd7271602802d53da4bde`
- TypeScript freeze runner: `ac5967ed94ee0745710ce5c2ccdfd6724ea3a6060e2e45925b6c2d1b27206c95`
- frozen predecessor packet: `14fbb89ad5384d1060bba00463f5db3380a8cf9ab7cfe6eab78692783416e6cd`

The packet was produced by `bun scripts/rust-migration/r5/freeze-core-semantic-types.ts`
with Bun 1.4.3. This evidence remains scoped to the four operations listed
above. Node/Python/browser/WASM and wire bindings, broader allocation-boundary
qualification, and default route review remain open.
