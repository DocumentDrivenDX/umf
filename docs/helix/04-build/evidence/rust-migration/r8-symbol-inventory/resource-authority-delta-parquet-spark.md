---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.resource-authority-delta-parquet-spark
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
    - id: CONTRACT-017
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: US-017
      kind: informed_by
    - id: US-018
      kind: informed_by
    - id: US-019
      kind: informed_by
---

# R8 resource authority: Delta log, Parquet framing and Spark datatype schemas

## Scope

This evidence resolves three additional JSON resources previously marked
`authority-unresolved` in the current R8 ledger. Each has a live repository
writer whose output was reproduced byte-for-byte in an isolated temporary
project. The mappings are limited to the output directly written by each
script; adjacent outputs are recorded as part of writer and package closure,
not transitively promoted as authorities. Installed archive bytes and runtime
behavior are not qualified here.

## Delta log inspection schema

`spec/extensions/delta-log/inspection.schema.json` is emitted by
`scripts/delta-log-schema.ts`. The writer reads the core native JSON schema's
`$defs.node` as the inspection node grammar and reads `CURRENT_CORE_VERSION`
from the model. CONTRACT-018 and US-018 AC9/AC10 govern source text capture
and bounded inspection. The focused Delta log/action tests exercise the public
surface; `src/index.ts`, the SDK build, and archive script establish source
and package closure. The writer also emits the extension `schema.json` and
`package.json` in that invocation, but this classification applies only to the
inspection schema row.

An isolated copy of the writer, model sources and native JSON schema reproduced
all three current output files byte-for-byte. The inspection schema has the
package route `package/dist/spec/extensions/delta-log/inspection.schema.json`;
that route remains `not-installed-qualified`.

## Parquet framing schema

`spec/extensions/parquet/framing.schema.json` is emitted by
`scripts/parquet-schema.ts`. Its framing grammar is inline in the writer, and
the script imports `CURRENT_CORE_VERSION` from the model for the adjacent
package manifest; it has no schema-file input. CONTRACT-019 and US-019 AC1/AC2
govern the bounded exact file capture and footer-region location. Capture and
footer tests, public exports and packaging scripts provide the source/package
closure. The same invocation emits the adjacent extension schema and package
manifest.

An isolated copy reproduced all three output files byte-for-byte. A negative
control changed the writer-owned framing `$id`; rerunning it changed the
generated framing schema and no longer matched the checked-in resource. Its
archive path is `package/dist/spec/extensions/parquet/framing.schema.json`;
installed bytes remain unqualified.

## Spark datatype schema

`spec/extensions/spark/datatype-schema.json` is emitted by
`scripts/spark-schema.ts`. Its recursive datatype grammar is defined inline;
the target schema has no schema-file input. The same script reads the native
JSON `$defs.node` and model version to produce the adjacent Spark envelope and
package manifest. Those dependencies belong to the complete script's current
reproduction and closure, but do not feed the `datatype-schema.json` grammar
itself. CONTRACT-017 and US-017 AC1/AC2 govern the known source shapes and
preservation of unknown forms. The focused Spark schema test, adapter, public
export, build and archive scripts are pinned in the ledger closure.

An isolated copy reproduced the datatype schema and both adjacent outputs
byte-for-byte. Its archive path is
`package/dist/spec/extensions/spark/datatype-schema.json`; installed bytes
remain unqualified.

## Remaining unknowns and recapture

The current generated ledger now classifies 43 resources as
`generated-authority-known` and 25 as `authority-unresolved`; the 42
`authored-authority-known` and 88 `candidate-generated` counts are unchanged.
These are counts from current `--stdout` generation, not a replacement capture;
the checked-in `gap-ledger.json` was not modified.

The relationship-selection schema remains unresolved because its one-off writer
is absent; history alone does not supply current reproducibility. Older
cardinality v4, facet v3 and key v2 operation schemas remain unresolved as
negative historical controls. Other old operation versions and package
installed-byte qualifications also remain open.
