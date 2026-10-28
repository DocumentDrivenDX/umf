---
ddx:
  id: umf.evidence.rust-migration.r8-parquet-arrow-negative-controls
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
---

# R8 Parquet Arrow metadata negative controls

The opt-in `parquet_relationship_observation` substrate retains the ordered
native Parquet footer metadata and refuses interpretation when Arrow schema
metadata is present. Its focused unit suite passes 6/6 under Rust 1.90.0,
including the retained predecessor report ordering and unknown-field controls.

The new negative-control test supplies four raw values under `ARROW:schema`:
invalid base64 text, two short or non-IPC byte sequences, and an empty value.
Each remains `Blocked("ARROW:schema metadata is retained but not interpreted")`
and is preserved byte-for-byte. A missing metadata value remains `None` and
blocked. Two entries with the same key remain in original order and both values
are retained; the observation reports that duplicate Arrow metadata is not
interpreted. No case attempts to decode Arrow IPC or infer a schema.

The test constructs bounded `DecodedSchema` values directly. The frozen report
case separately decodes its retained footer fixture and checks the 11 emitted
non-root schema entries. These are unit-level controls for retention and
refusal, not a system-level Parquet interoperability run.

Run from the repository root with the pinned toolchain:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo test -p umf-core parquet_relationship_observation::tests --lib
```

The source hashes for this cut are:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/parquet_relationship_observation.rs` | `b954e8019dff218804a078a6460ce44a791c692b488e5502ab6fb8d88df4515d` |
| frozen predecessor fixture | `7d7e80a532de1c4bc581d082aefb0cebf242d0af4daa433ffbe7752b454ad248` |

The observation remains an opt-in substrate. Arrow interpretation,
predecessor relationship-classifier parity and diagnostics, receipt verification
or recovery, host binding evidence, default routing, and release qualification
remain outside this evidence.
