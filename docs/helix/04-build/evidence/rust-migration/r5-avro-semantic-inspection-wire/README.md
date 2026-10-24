---
ddx:
  id: umf.evidence.r5-avro-semantic-inspection-wire
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-007
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R5 Avro structural inspector transport

This opt-in slice exposes the existing bounded structural inspector through
`umf.core-wire/1`, the Rust CLI, and Rust-backed Python and Node bindings. The
profile is `umf-r5-avro-inspect/0.1.0`; its sole operation is
`avro.schema.inspect`, which accepts an exact tagged native JSON root and an
ordered list of `{id, root}` dependency trees. IDs remain provenance labels,
and the operation performs no implicit I/O.

Results preserve the inspector's separate `valid` and `complete` flags. Every
successful inspection has the `AVRO_PROFILE_LIMIT` warning and therefore
reports `complete: false`; it never claims full Avro 1.12 validity. Name
resolution, duplicate declarations/fields, unions, records, arrays, and maps
follow the bounded Rust inspector already described in the [core inspection
evidence](../r5-avro-semantic-inspection/README.md). Defaults and logical types
are retained and receive warnings; their semantics are not interpreted.
Unknown tagged-tree representation content remains subject to the existing
export guard.

The frozen predecessor and independent Apache Avro 1.12.0 / fastavro 1.12.2
observations remain in that core inspection packet. Its tests cover accepted
recursive cross-dependency and named-array schemas, plus unresolved references,
missing field names, and missing field types. This transport adds exact wire
checks for ordered dependency resolution, explicit incomplete status, unresolved
name diagnostics, duplicate dependency-ID refusal, unknown-operation refusal,
and host work-control interruption. Python dependency admission accepts only
lists or tuples, rejects more than 100,000 entries before materializing a new
request list, and checks controls before and during collection. Node applies
the same array and entry-count bounds and runs host preflight before inspecting
the dependency argument.

Local Rust 1.90.0 offline verification:

- `cargo test -p umf-core-wire --test r5_avro_inspect_wire --offline` — 4 passed.
- `cargo test -p umf-cli --test avro_inspect_cli --offline` — 2 passed, including
  empty-PATH CLI execution and work/deadline controls.
- `cargo check -p umf-core-node -p umf-core-python --offline` — passed.
- TypeScript `tsc --noEmit` — passed.

These are source-level binding checks. Installed Python-wheel and Node-addon
replay against this source cohort remains pending. The added binding entry
points are opt-in and do not change default Avro adapter selection. Apache and
fastavro parser acceptance does not establish datum encoding, defaults, logical
types, or full-language conformance.
