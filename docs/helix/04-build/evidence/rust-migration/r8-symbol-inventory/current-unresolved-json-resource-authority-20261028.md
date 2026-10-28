---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.current-unresolved-json-resource-authority-20261028
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
    - id: umf.evidence.rust-migration.r8-symbol-inventory.remaining-schema-authority-review
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
    - id: CONTRACT-045
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: TD-044
      kind: informed_by
    - id: TD-045
      kind: informed_by
    - id: TD-046
      kind: informed_by
---

# R8 current-source boundary for five unresolved JSON resources

**Capture:** 2026-10-28, repository `HEAD` `e5ef91e6caddf28090c5d7f76c94e90a172485f6`.

## Finding and proposed mapping

The five resource identities below are the complete unique-file set whose
R8 `resourceOwnership.authority.status` is `authority-unresolved` in the
captured ledger. The current source review found no direct governing clause
that names the exact resource path and its current result, and no reproducible
current writer plus complete input closure. Keep each row
`authority-unresolved`, with no generator, governing artifact, generator
inputs, or complete source closure asserted. The historical facts below are
provenance only; they do not promote these files to authored or generated
authority.

| Canonical resource and current SHA-256 | Exact source/build evidence found | Current authority boundary |
| --- | --- | --- |
| `spec/core/key-selection.schema.json` — `c3aef95bdb7b0134b8d52076e2d82394f656fde41f0da092af54aa052d1747f3` | Historical writer `scripts/core-key-versioned-schemas.ts` at `280d3449b95ae32d378f1c379918b7c139d52de9`; for this output it reads `spec/core/facet-selection.schema.json` and `spec/core/key-document.schema.json`. The current bytes are the `8706814a9605d7325eef32a5df3d05696de00b62` blob. | The writer and inputs explain an older generation event only. TD-044 does not name this exact current resource; no current writer/input closure was found. |
| `spec/core/relationship-selection.schema.json` — `d8bf01dcad908e19a26ee9f83c3b1da5e092d0f6055b283cb54d6997c32a1e9c` | Historical writer `scripts/core-relationship-versioned-schemas.ts` at `887d67410b42ffc58d8f0853185b33a603320e19`; for this output it reads `spec/core/key-selection.schema.json` and `spec/core/relationship-document.schema.json`. The current bytes are the `8706814a9605d7325eef32a5df3d05696de00b62` blob. | CONTRACT-045 and TD-045 govern relationship-selection semantics, but do not name these current composite bytes. The one-off writer is not a current writer and its current inputs are not closed. |
| `spec/core/schema-properties-selection.schema.json` — `893cf29692b0ba9c21037a90e0361b8adc19a2c3007cee84f22092276004f641` | Historical writer `scripts/core-schema-properties-schema.py` at `436e975d5e8b6b395efb45685deb5eff0f481d45`; for this output it reads `spec/core/relationship-document.schema.json` and `spec/core/relationship-selection.schema.json`. Its source snapshot is retained as `docs/helix/04-build/evidence/metamodel-authority/history/scripts__core-schema-properties-schema.py.txt`. The current bytes are the `8706814a9605d7325eef32a5df3d05696de00b62` blob. | CONTRACT-049 governs schema-property semantics, but does not name this exact resource. The archived writer is not a current writer and does not close inputs for the current bytes. |
| `spec/core/parquet-relationship-classification.schema.json` — `c89561ab5f492c1242b7d425bcba063b82c13296931f12566414c535360478ca` | Introduced at `f69d1a7c7b7d62d4f2924217b813f8b58b07ecef`, changed at `8706814a9605d7325eef32a5df3d05696de00b62`, and included in the `affectedResourceSha256` set of `docs/helix/04-build/evidence/metamodel-authority/regression/current-schema-generators/receipt.json`. The receipt enumerates 44 other generator entrypoints; none is an exact writer for this resource. | CONTRACT-019 governs Parquet metadata and TD-045 relationship classification, but neither names this resource. The cohort receipt records resource bytes in a broad generator run, not an exact producer or input-to-output relation. No exact current writer or closure was identified. |
| `spec/projections/sqlserver-physical-binding.schema.json` — `a746543f0a16b325d6eb77f5708cf98a97706f8cc69094819b32f17a74f39562` | Introduced at `594be35256233cd0e052e581345c1f62b1aaac60`, changed at `8706814a9605d7325eef32a5df3d05696de00b62`; current runtime consumer is `src/projections/binding-sqlserver/index.ts`. Browser/oracle scripts and tests consume or validate it. | CONTRACT-042 and TD-046 govern physical binding behavior, but do not name this exact result schema. Consumer and test references do not identify an author or generator. No exact current writer/input closure was found. |

The five current working-tree bytes match their blobs at `8706814a9`. The
current `spec/metamodel/generated/manifest.json` has no `sources`,
`workspaceInputs`, or `outputs` entry for any of the five paths. This is a
bounded negative result about that metamodel build manifest, not proof that no
other writer could exist. A literal-path search across design contracts,
technical designs and ADRs returns no exact resource-path clause. The
semantic obligations and consumer/test references remain relevant context,
but they cannot establish byte authority by themselves.

## Read-only verification

The following checks were run from the repository root and did not write
source, generated data, inventories, or ledgers:

```sh
node -e 'const m=require("./spec/metamodel/generated/manifest.json"); for (const p of ["spec/core/key-selection.schema.json","spec/core/relationship-selection.schema.json","spec/core/schema-properties-selection.schema.json","spec/core/parquet-relationship-classification.schema.json","spec/projections/sqlserver-physical-binding.schema.json"]) { if (m.sources[p] || m.workspaceInputs[p] || m.outputs[p]) throw Error(`unexpected metamodel closure entry: ${p}`); }'
node --test --test-name-pattern='versioned core operation schemas|semantic-types selection|named DDD and SQL Server schemas' scripts/rust-migration/r8/gap-ledger.test.mjs
```

The manifest check passed. The selected ledger suite passed 3/3 tests. Its
negative controls retain `authority-unresolved` for the three composite
selection resources, retain the Parquet relationship classification schema
as unresolved, and require five unique unresolved resource authorities in the
captured ledger. This is source-authority evidence only; it does not qualify
schema behavior, SDK archive bytes, installed routes, Rust parity, or release
readiness.

The earlier [remaining-schema authority review](remaining-schema-authority-review.md)
contains the complete historical commit and current-byte comparison table.
This packet adds the current metamodel-manifest boundary and a rerunnable
read-only test result; it does not change the generated inventory or ledger.
