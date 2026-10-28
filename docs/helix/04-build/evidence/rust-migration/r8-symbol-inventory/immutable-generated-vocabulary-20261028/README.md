---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.immutable-generated-vocabulary-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# R8 immutable generated vocabulary classification

**Capture:** 2026-10-28, worktree `HEAD` `01734212e` before this evidence update.

The condition-aware ledger now records four uniquely source-pinned exports as
`immutable-generated-data`: `SCALAR_TYPES`, `ELEMENT_KINDS`, `NULLABILITIES`,
and `CARDINALITIES`. Each is an alias from `src/model/types.ts` to one of the
four frozen arrays on generated `coreVocabulary`. The generated file freezes
each array and the enclosing object; `src/model/types.ts` freezes
`SCALAR_TYPES` again. The other three aliases preserve object identity directly.

The classifier is an exact allow-list of those four export names, their common
source path, and source SHA-256
`6943cdad1c110de2dae56ac3820524f2874eddd9a84580be4da93477bbe76a0c`. A source
hash or declaration-kind mismatch fails closed. It makes no inference from
`VariableDeclaration`, `ClassDeclaration`, names, or initializer shape.
`scalarTypesForVersion` remains executable because it compares the requested
version with `CURRENT_CORE_VERSION`. `UmfError`, `Registry`,
`SecurityAuthorityGuard`, and `SecurityReadRegistration` remain executable
class declarations.

The four values occur on Node V4, browser V4, and explicit `./reference`
routes. The default facades re-export them from `src/model/types.ts`; the
reference entry reaches that same module through `src/index.ts`. Focused runtime
observations passed on Node 26.12.1 (bundled from the Node V4 entry), Bun 1.4.3
(imported from the Node V4 source entry), Chromium 153.0.8010.12 (browser
bundle of the exact shared `src/model/types.ts` module selected by the browser
facade), and Node reference (bundled from `src/index.ts`). All hosts returned
the same four ordered arrays, reported each array frozen, and rejected a
`push` mutation. The existing Bun assertion also verifies identity with the
four generated `coreVocabulary` arrays. The generated-source audit pins that
identity and the compiler lineage.

The observation is scoped to these constant values. The Node bundle used the
existing local native addon only to initialize the complete facade. The
Chromium observation loaded the shared TypeScript module directly; it did not
initialize the complete browser V4 WASM facade. These checks do not establish
installed archive parity, consumer retirement, or release qualification.
No declaration is marked retired.

## Ledger result

The generated ledger retains 3,366 route declarations and 1,123 unique export
names. It counts 4 immutable generated-data exports across 12 route rows,
921 logical executable rows, and 921 executable default-route gaps. The Node
and browser roots each report 921 executable rows; `./reference` reports 918.
The previous executable-gap count of 925 included these four data aliases.
There are still zero retired executable declarations. Existing Rust mapping,
installed-route, and release qualification counts are unchanged.

## Source and output pins

| Input | SHA-256 |
| --- | --- |
| `src/model/types.ts` | `6943cdad1c110de2dae56ac3820524f2874eddd9a84580be4da93477bbe76a0c` |
| `src/generated/core-model.ts` | `29d5ffb1049f7ca258073cdab358eff0a983303763d01d3313ee0fa59f161dc2` |
| `spec/metamodel/umf.yaml` | `35b72a7f6aa86c98398192e5b67d5841d77127743c671c742dd871a7baee58ca` |
| `spec/metamodel/generated/manifest.json` | `e13d008bc1fcd1441676dab5057bf485e8c887957d569067a1dab46b45988063` |
| `scripts/rust-migration/r8/gap-ledger.mjs` | `9e17eca9fa102394107bddde52e6b172f8ac4cde517033cc63ab44800f21f054` |
| `scripts/rust-migration/r8/gap-ledger.test.mjs` | `c8c828e435ba6de66925611b01c8ffa54bda0e9b96d81df16826cd66312281a3` |
| `gap-ledger.json` | `201e0f691d4e1192d9744f30b67774187869fa9bf08cf15b18bc68bf369848c9` |

## Verification

```sh
node --test --test-name-pattern='five model vocabulary|four source-pinned' scripts/rust-migration/r8/gap-ledger.test.mjs
node scripts/rust-migration/r8/gap-ledger.mjs --check
```

The focused run passed 2/2 tests, the complete gap-ledger suite passed 76/76, and the combined gap-ledger plus installed-route suite passed 90/90. The first focused test covers source closure hashes,
metamodel/generated output pins, Bun array identity/freeze behavior, and the
executable version-gate control. The second builds the Node V4, reference, and
browser-shared-module routes and checks values and mutation refusal across all
four hosts. The ledger freshness check confirms the regenerated JSON matches current
source. Earlier installed-route aggregates keep their captured historical
925-gap scope; this classification does not rewrite those receipts.
