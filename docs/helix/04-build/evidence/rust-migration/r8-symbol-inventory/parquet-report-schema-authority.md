---
ddx:
  id: umf.evidence.rust-migration.r8-parquet-report-schema-authority
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
    - id: CONTRACT-019
      kind: informed_by
    - id: US-019
      kind: informed_by
---

# R8 Parquet report-schema authority

This family covers the report schemas for definition/repetition level decoding,
physical carrier decoding, physical row assembly, and bounded typed-value
projection. CONTRACT-019 defines these in US-019-AC16 through AC19 (sections
at lines 638, 665, 699 and 730); the corresponding acceptance clauses are in
US-019. Each output has a named public export in `src/index.ts`.

The exact generator chain is `pages.schema.json` → `levels.schema.json` →
`physical.schema.json` → `rows.schema.json`, with `values.schema.json`
composing the physical and rows schemas. The ledger records each direct input
relationship and pins the full transitive input bytes: pages, framing,
metadata, footer-decode and Parquet IDL. It also pins the generators that
produce those upstream schemas, along with `src/model/types.ts`, the four
public exports, and SDK build/archive rules. Upstream resource authority is not
inferred by these byte-input pins.

The four exact-output generators now accept `--check`. In that mode each
compares its deterministic rendering against the existing schema and rejects
missing or stale output without writing. Focused tests verify the input map,
contract/story and package source closure, and that output bytes remain
unchanged after checks. This establishes source/build closure only; installed
archive bytes remain unqualified.

| Generated resource | Generator | SHA-256 |
| --- | --- | --- |
| `spec/extensions/parquet/levels.schema.json` | `scripts/parquet-levels-schema.ts` | `f69d1c4e94d716d4f98ad9cf34fa8e5221bf8d555f931d808d83c4c25a4fc965` |
| `spec/extensions/parquet/physical.schema.json` | `scripts/parquet-physical-schema.ts` | `3fd2a92f571d7f55943d7ca240ef753244ba63104238cd4724a5c9b34991b7eb` |
| `spec/extensions/parquet/rows.schema.json` | `scripts/parquet-rows-schema.ts` | `c3035bc55e63af1ffa41e3ff973f0e25d24471eb958a23595d2e92e347864cf6` |
| `spec/extensions/parquet/values.schema.json` | `scripts/parquet-values-schema.ts` | `5c48cd0eefc1ffdd6b12e816c4a6acc5f2957492c27787246a2dde1361927889` |

Validation: all four generator checks passed; the ledger check passed; focused
R8 tests passed 15/15. Ledger SHA-256:
`be7de0f065b86b1f136fa068ee8c9f60c5882f1601272a480f7feb58d6de1955`.
Checkpoint resource-authority counts are 24 generated-known, 13
authored-known, 99 candidate-generated and 62 unresolved aliases. The source
cohort is moving; this ledger is a checkpoint for review and requires final
recapture after other source writers pause.
