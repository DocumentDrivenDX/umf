---
ddx:
  id: umf.evidence.rust-migration.r8-selection-diagnostic-materialization
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Selection diagnostic materialization stage

This bounded Rust stage introduces a crate-private ordered diagnostic carrier
for Selection. Static Engine diagnostics retain their existing order and are
materialized with the same `valid`, `complete`, and diagnostic fields. The
static route preserves Engine's precomputed `Validation.valid`; this matters
when a structural failure is represented by a warning-severity diagnostic.
The focused regression covers that case. Opaque callback diagnostics have a
reserved representation and retain their original host handles for later
operations, but static conversion stops rather than dropping or normalizing
them.

Validation run with the pinned Rust 1.90.0 toolchain and a separate target
directory:

```sh
cargo test --locked --offline -p umf-core --lib selection_diagnostics::tests
cargo test --locked --offline -p umf-core --test r5_selection
rustfmt --check crates/umf-core/src/selection.rs crates/umf-core/src/selection_diagnostics.rs
git diff --check
```

The diagnostic-materializer tests pass 5/5 and the frozen R5 Selection suite
passes 10/10, including exact predecessor success/refusal envelopes. The
Selection host route remains unwired: this stage does not establish callback
parity, `kindRuntime` behavior, final UmfError construction/exposure, default
root selection, or semantic retirement.
