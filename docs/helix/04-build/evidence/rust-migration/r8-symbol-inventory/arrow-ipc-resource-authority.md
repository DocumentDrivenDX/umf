---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-ipc-resource-authority
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# R8 Arrow IPC report-schema authority

This family covers the layout, footer-consistency and field-rename report
schemas. CONTRACT-016 assigns these result schemas in its IPC boundary,
consistency and rename sections. Each schema has one public `src/index.ts`
export and one exact-output generator whose schema value is constructed in the
generator source. The generators have a read-only `--check` mode: a missing or
stale output fails, while a matching output is read and compared without a
write call.

| Generated resource | Generator | SHA-256 |
| --- | --- | --- |
| `spec/extensions/arrow-ipc/layout-result.schema.json` | `scripts/arrow-ipc-layout-schema.ts` | `10bcaf62f6cdf55ac6b55348c279a0b3b4ad77747b22dbb9708c01071ff7b63d` |
| `spec/extensions/arrow-ipc/consistency-result.schema.json` | `scripts/arrow-ipc-consistency-schema.ts` | `00525e2c08ca230871a179f6abf7d0f0ac76b5120c8a00cef1d7c0ea7901b627` |
| `spec/extensions/arrow-ipc/rename-result.schema.json` | `scripts/arrow-ipc-rename-schema.ts` | `ff0b712cddf3ee907eed082b3db915ea61c22232dff6417e1971b070920deb1b` |

The ledger pins CONTRACT-016, each generator, `src/index.ts`, the SDK build
and archive rules, and the per-resource `dist/spec/` path. Focused tests check
these source hashes and invoke each generator with `--check`, verifying that
the resource hash is unchanged afterward. This records source/build closure;
it does not qualify installed archive bytes.

Validation: all three `bun scripts/arrow-ipc-*-schema.ts --check` commands
passed; `node scripts/rust-migration/r8/gap-ledger.mjs --check` passed; the R8
gap-ledger test suite passed 11/11 tests. Ledger SHA-256:
`6d0803d2d80392372e3863d39c2d9b4e585686934e55a2772e2fc4a9e7d9538d`.
Current resource-authority counts are 14 generated-known, 13 authored-known,
109 candidate-generated, and 62 unresolved aliases. The unresolved Arrow base
family remains open.
