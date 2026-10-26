---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.remaining-schema-authority-review
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
    - id: CONTRACT-019
      kind: informed_by
    - id: CONTRACT-041
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

# R8 remaining schema authority review

## Finding

The five current resources reviewed below should remain
`authority-unresolved`. Their historical commits, current Git blobs, runtime
consumers, and broad semantic contracts are identified, but none supplies an
exact current writer/input closure or a governing contract/design clause that
names the exact resource path and current result shape. This review makes no
ledger change, runtime claim, or retirement claim.

| Current resource | Current SHA-256 | Historical source evidence | Disposition |
| --- | --- | --- | --- |
| `spec/core/key-selection.schema.json` | `c3aef95bdb7b0134b8d52076e2d82394f656fde41f0da092af54aa052d1747f3` | Introduced at `280d3449b95ae32d378f1c379918b7c139d52de9`; historical writer `scripts/core-key-versioned-schemas.ts` built 0.6.0 from facet selection plus Key definitions. Refreshed at `8706814a9605d7325eef32a5df3d05696de00b62`. | Unresolved: TD-044 describes Key selection requirements but does not name this exact result schema; no current writer/input closure for the refreshed bytes. |
| `spec/core/relationship-selection.schema.json` | `d8bf01dcad908e19a26ee9f83c3b1da5e092d0f6055b283cb54d6997c32a1e9c` | Introduced at `887d67410b42ffc58d8f0853185b33a603320e19`; historical `scripts/core-relationship-versioned-schemas.ts` composed the Key selection schema with relationship definitions. Refreshed at `8706814a9605d7325eef32a5df3d05696de00b62`. | Unresolved: CONTRACT-045/TD-045 govern relationship selection semantics but do not establish these exact composite bytes; the historical one-off writer and complete current input closure are absent. |
| `spec/core/schema-properties-selection.schema.json` | `893cf29692b0ba9c21037a90e0361b8adc19a2c3007cee84f22092276004f641` | Introduced at `436e975d5e8b6b395efb45685deb5eff0f481d45`; the archived `scripts__core-schema-properties-schema.py.txt` constructs it from the relationship-selection resource. Refreshed at `8706814a9605d7325eef32a5df3d05696de00b62`. | Unresolved: CONTRACT-049 governs schema properties but does not name this exact selection resource; the archived writer does not establish current bytes or a complete current input closure. |
| `spec/core/parquet-relationship-classification.schema.json` | `c89561ab5f492c1242b7d425bcba063b82c13296931f12566414c535360478ca` | Introduced at `f69d1a7c7b7d62d4f2924217b813f8b58b07ecef`; refreshed at `8706814a9605d7325eef32a5df3d05696de00b62`. Current runtime consumer is `src/core-ideals/relationship-parquet.ts`. | Unresolved: CONTRACT-019 governs Parquet metadata and TD-045 relationship design, but neither names this exact classification schema; no exact writer was found. |
| `spec/projections/sqlserver-physical-binding.schema.json` | `a746543f0a16b325d6eb77f5708cf98a97706f8cc69094819b32f17a74f39562` | Introduced at `594be35256233cd0e052e581345c1f62b1aaac60`; current core-reference refresh at `8706814a9605d7325eef32a5df3d05696de00b62`. Runtime consumer is `src/projections/binding-sqlserver/index.ts`. | Unresolved: CONTRACT-042 and TD-046 govern physical binding and SQL Server target behavior, but do not name this exact result schema; no exact writer was found. |

The listed current hashes match `git show 8706814a9:<path>` for all five
resources. The three selection writers are retained only as historical
evidence: their source snapshots explain older outputs, while the metamodel
refresh changed references in their current files. The Parquet and SQL Server
history identifies authored introduction and refresh commits, not a current
generator. Static searches of the governing design tree found no exact
resource-path clause for these five schemas. Consumer imports and validation
tests establish use, not authority.

## Source and scope limits

The parent R8 ledger and generator/test files were not modified. This review
does not qualify package/archive bytes, installed SDK routes, schema semantics,
or Rust parity. No current generator check was used as authority evidence for
these five resources.
