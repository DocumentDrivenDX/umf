---
ddx:
  id: umf.evidence.rust-migration.r8-semantic-reference-parity-candidate
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
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-semantic-types
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-type-accessors
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-types-bindings
      kind: informed_by
---

# R8 candidate: core semantic reference and retained accessor parity

## Recommendation

Select the six-operation semantic reference/accessor cohort for the next cross-host parity slice: `inspectCoreSemanticTypes`, `getCoreSemanticTypes`, `declareCoreSemanticTypes`, `verifyCoreSemanticTypeDeclaration`, `getSemanticTypes`, and `setSemanticTypes`.

This is the best bounded next candidate among the semantic-type exports because all six operations already have exact Rust core owners, frozen TypeScript predecessors, and opt-in Node/WASM wrappers. The six-operation binding packet records successful installed Node/Bun and Chromium 153 execution. The current R8 default Node and browser roots still inherit TypeScript for all six, and Python exposes none of these six functions. Python's existing `SemanticTypeRegistry`/value-validation API is a neighboring contract, not parity for core declaration/accessor operations. Promoting the six exact operations would therefore close the largest already-implemented cross-host gap without claiming the broader semantic registry, callback, transition, or extension package surfaces are complete.

This candidate is intentionally narrower than the 15-export semantic-type predecessor. The three published schema resources and six remaining runtime exports (`SemanticTypeRegistry`, `semanticTypesRegistry`, `validateSemanticTypeValue`, `validateCoreSemanticTypeValue`, `SEMANTIC_TYPES_EXTENSION`, and `semanticTypesPackage`) remain separate data, registry, or callback work. CONTRACT-078's upgrade/rollback transitions also remain out of scope. The existing extension accessor behavior for a runtime-invalid `vocabularies: null` currently diverges: TypeScript throws a native `TypeError`, while the Rust envelope has no matching error. That case must remain an explicit blocker or receive a separately reviewed compatibility decision; this candidate does not silently waive it.

The broader callback registry/value slice is the leading follow-on, consistent with the plan's shared-semantic queue, but its browser callback transport is still open and its Rust operations require cooperative callback work to share the same operation context. The six-operation cohort is the higher-confidence first cross-host cut: its Node/WASM wrappers and installed replay already exist, whereas Python parity and default-root selection are clear remaining tasks. The in-flight Core Key tuple work is excluded from this comparison so it cannot create shared-file overlap.

## R8 basis and limits

The current condition-aware R8 inventory reports 1,120 public names per root, 922 executable names, and 198 JSON aliases. The derivative ledger reports 29 Rust-selected names per default Node/browser root, 893 inherited TypeScript executable declarations per route, 922 unique executable retirement gaps, and `bindingRoutesProven: 0`. It maps each of the six candidate operations to an exact Rust core owner, but reports each default root row as `bindingRouteStatus: unproven`. The prior opt-in binding packet is older evidence for its captured source closure; it does not satisfy the current R8 cohort gate or default selection.

The rationale is impact plus readiness: the operations author/read core 0.10 semantic annotations and preserve the older `umf.semantic-types` extension without conflating those namespaces. CONTRACT-078 makes exact vocabulary/version/term references and copied source preservation part of the core model. The frozen controls exercise missing/declared/legacy-version behavior, unknown qualifier preservation, copy isolation, declaration verification, and extension-profile refusal. Browser and Node wrappers already exist. Python parity is the principal missing host implementation; installed-current-cohort routing and review remain separate gates.

## Exact scope and source map

| Root export | TypeScript predecessor | Rust owner / operation | Existing Node and WASM wrapper | Current route gap |
| --- | --- | --- | --- | --- |
| `inspectCoreSemanticTypes` | `src/model/semantic-types.ts:23` | `umf_core::core_semantic_types::inspect_core_semantic_types`; `model/inspectCoreSemanticTypes` | `bindings/core/{node,wasm}/src/core-model.js` | Root defaults still TypeScript; no Python API |
| `getCoreSemanticTypes` | `src/model/semantic-types.ts:28` | `umf_core::core_semantic_types::get_core_semantic_types`; `model/getCoreSemanticTypes` | same `core-model.js` files | Root defaults still TypeScript; no Python API |
| `declareCoreSemanticTypes` | `src/model/semantic-types.ts:33` | `umf_core::core_semantic_types::declare_core_semantic_types`; `model/declareCoreSemanticTypes` | same `core-model.js` files | Root defaults still TypeScript; no Python API |
| `verifyCoreSemanticTypeDeclaration` | `src/model/semantic-types.ts:45` | `umf_core::core_semantic_types::verify_core_semantic_type_declaration`; `model/verifyCoreSemanticTypeDeclaration` | same `core-model.js` files | Root defaults still TypeScript; no Python API |
| `getSemanticTypes` | `src/extensions/semantic-types/index.ts:71` | `umf_core::semantic_type_accessors::get_semantic_types`; `extensions/getSemanticTypes` | same `core-model.js` files | Root defaults still TypeScript; no Python API |
| `setSemanticTypes` | `src/extensions/semantic-types/index.ts:81` | `umf_core::semantic_type_accessors::set_semantic_types`; `extensions/setSemanticTypes` | same `core-model.js` files | Root defaults still TypeScript; no Python API; `vocabularies: null` error mismatch |

Expected integration points, subject to a reviewed design, are `src/index-node-v4.ts`, `src/index-browser-v4.ts`, the existing Node/WASM `core-model.js` facades and `host_json.rs` dispatch, and a new or extended Python public API under `python/src/umf/`. No integration code is changed by this packet. The exact selected wrapper method names already appear in `r5-semantic-types-bindings/receipt.json`; root selection and Python API design remain proposed work.

## Proposed frozen controls

[`proposed-controls.json`](proposed-controls.json) is a control plan, not a frozen outcome receipt. Before parity changes, recapture the current TypeScript predecessor and source hashes for the six operations; then run the same cases against Node, Bun, Chromium/WASM, and Python. Reuse the frozen core and accessor packets as source controls, but create one combined source-exact packet so cross-operation refusal order and all host outcomes are pinned together.

Required controls include schema-first malformed/extra receipt refusal; valid and stale receipt recomputation; old core version and invalid identity/request precedence; absent versus empty declaration; null removal; unknown reference qualifiers blocking edits; unknown members preserved; accessor missing element/annotation, invalid profile/payload and warning ordering; copy isolation in and out; registry/runtime native failure behavior; cancellation, deadline, work limit and zero-touch refusal before host reads. Add a direct regression for the existing `vocabularies: null` native `TypeError` discrepancy and keep it an explicit mismatch unless a versioned error contract is approved.

Python must expose the same six operation meanings with the same published receipts/errors and share one Rust-owned `Context` per operation, including callback-free accessor registration. Node/Bun/browser must be tested through the default package roots after source selection, not only through the opt-in facade. Use a fresh installed package and exact WASM/browser artifact hashes; keep `./reference` available as the explicit TypeScript oracle. None of these tests by themselves retires a declaration: inventory/ledger recapture and independent review must accept the resulting source cohort.

## Source snapshot

The candidate was identified against R8 inventory SHA-256 `e7596f3ce390e7e5bcc971b79074e312daf72e6ca1dd400384d4fb920b298239` and gap-ledger SHA-256 `066ec4386bfee2d685c1677250dd55f7e047916ec50d1d71e00772b51aff07dd`. Their source context is pinned here: `src/index-node-v4.ts` `c0b081a7d95e8e6c2aa7f731d8e92e573d1a451b377053433915b44556f98482`, `src/index-browser-v4.ts` `fe49911fc9bfc032a20a3ceedb0b16655f24d195950ecfb242a6c6df4f0e58e2`, `src/model/semantic-types.ts` `f1be6e2ed74adbc0bf0d3b7e96a2c62e6b5b9a7321cdaad402aecb861110bd20`, and `src/extensions/semantic-types/index.ts` `64482ca4d9d8abd65b19b342e1722eaff8497ce52ff44bf5dc3a7ca6f415c6e2`.

Existing evidence packet hashes: core predecessor `a49334fc63509773e87ad2c3818e85d39b71c44bbdce7215789863954a982355`; accessor predecessor `90840d941d4e717946735e5786c665ac4a9ba13e1bce34126af91e3a9041f084`; opt-in binding receipt `d5ac0addd829ff921515ec575c3d749c2e0048eed6e80af7487a1bf50ded8921`. Current Rust source cohort hashes should be recaptured before implementation because concurrent R5 work may change shared binding files.
