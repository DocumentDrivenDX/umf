---
ddx:
  id: umf.evidence.rust-migration.r5-model-bindings
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R5 opt-in core model binding evidence

This cohort exposes the three authored core ideals through the existing
`umf.core-wire/1` tagged request: cardinality inspect/declare/verify, Element
kind inspect/declare/verify, and Field nullability inspect/declare/verify.
Dispatch uses the established `model/*` operation names and retains raw UTF-16
values, keys, and module/element identities. No direct UTF-8 N-API/WASM string
exports were added for model inputs. Node/Bun exports the separate
`createCoreModelEngine(resources, options)` factory; WASM exports
`createCoreModelEngine(module, resources, options)` and
`initializeCoreModelWasm(resources, loader, host, options)`. The default
TypeScript API remains in place.

The retained TypeScript cardinality API's complete results and refusal envelopes
were frozen before wrapper comparisons in
[`frozen-cardinality-typescript.json`](frozen-cardinality-typescript.json).
The kind/nullability baseline is the retained 11-success and 13-refusal cohort
in `scripts/rust-migration/r5/kind-nullability/frozen-typescript.json` and
`frozen-refusals.json`. Existing core cardinality inputs and operation expectations
come from the versioned `r5-cardinality/vectors.json` capture. These are authored
ideals under CONTRACT-001/040; they do not classify any physical or native target.

Engine resources and registry are constructed within the same ordinary
operation `Context` that performs model operation, operation-result validation,
and receipt verification. That context temporarily raises only `max_values` to
the independent catalog ceiling while trusted resources and registry are
admitted, then restores the ordinary 100,000-value limit before input documents
are inspected. The 4,000,000 UTF-16 text limit and depth 128 remain in force.
Tagged transport decoding and final transport encoding use the existing wider
envelope context; the host cancellation, deadline, and work hook is shared
throughout all stages. The Node and WASM model factories preflight controls
before touching resources, meter each of the five resources independently with
the 1,000,000-value catalog ceiling, and account for request/response host
conversion. Hard-isolated requests refuse before execution and resource
snapshotting.

The bounded verification run used rustc/cargo 1.90.0, Node 26.12.1, Bun 1.4.3,
wasm-bindgen 0.2.100, and Playwright Chromium 153.0.8010.12 on Darwin arm64.
`cargo check --locked -p umf-core-wire -p umf-core-node -p umf-core-wasm`
passed. The core kind/nullability test passed 6/6; the wire crate passed 8/8,
including all 139 retained core request vectors. Both Node and Bun executed the
rebuilt N-API addon and matched 11 complete kind/nullability success envelopes,
13 refusal envelopes, 8 complete cardinality success envelopes, and 6
cardinality refusal envelopes. The complete cardinality expected outputs are
compared against the frozen TypeScript file linked above.

Ajv 8 Draft 2020-12 independently accepted 15 actual Rust binding outputs
(11 kind/nullability plus four cardinality inspection/declaration/verification
and surrogate-identity receipts) and rejected four mutated nested-source
controls. Chromium executed the rebuilt wasm32 artifact through the asynchronous
initializer. It matched the same kind/nullability success/refusal and cardinality
success/refusal envelopes and ran without Node `process` or `Buffer` globals. In
both Node/Bun and Chromium, zero-work, already-cancelled, expired-deadline, and
hard-isolated factory calls received a hostile proxied resource bundle and
returned the expected code with zero resource traps fired. Successful metered
construction plus an operation accounted 25,157,479 host work units in Chromium;
Node and Bun passed the same controls and metered-operation check. No independent
native-system oracle or native classifier equivalence is claimed for these ideals.

`bun run typecheck` and `git diff --check` passed. The exact Rust artifacts were
built under `/private/tmp/umf-r5-model-bindings-target` and the generated web
package under `/private/tmp/umf-r5-model-wasm/pkg`; the N-API artifact was copied
to a temporary package directory because this managed worktree does not permit
writing its ignored `.node` file. Their recorded SHA-256 values are:

| Artifact | SHA-256 |
| --- | --- |
| Node addon (`libumf_core_node.dylib`) | `e556d9012548a8b1a7f20eae836cb187c978011933e72e40a21e8efdff79e2f8` |
| Rust WASM module (`umf_core_wasm.wasm`) | `5a9bea6c13c60ffddb4612008090f6ee752ebec7f87f548d8432b41e8c22fc61` |
| Bound web WASM module (`umf_core_wasm_bg.wasm`) | `85c3579e736fd6becac185079233a70c75f13703f46d7ae56704b10963468bd0` |

The Node parity command is `UMF_R5_BINDING_ENTRY=/private/tmp/umf-r5-node/index.js node scripts/rust-migration/r5/model-bindings-parity.mjs` (repeat with `bun` for Bun). Ajv validation is `bun scripts/rust-migration/r5/verify-model-binding-ajv.mjs`. The real-browser qualification is `UMF_CHROMIUM_PATH=/Users/erik/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell bun scripts/rust-migration/r5/model-bindings-browser.ts`.

This is opt-in R5 evidence only. It does not change the default TypeScript API,
claim R7 cutover, or qualify unfinished model families, native classifiers, or
other adapters.

Independent Sol review initially found a P2 host-conversion gap: model factory
resource snapshots and request/result conversion could allocate before the
work, cancellation or deadline hook ran. After the correction described above,
reopened review reproduced Node/Bun complete-envelope parity, Chromium 153
preflight refusals with zero resource traps, 25,157,479 metered host work units
for a successful factory and operation, 15 accepted actual Ajv outputs and four
rejected mutations. It matched the three recorded native/WASM artifact hashes
and found no remaining P1/P2 in this bounded opt-in cohort.
