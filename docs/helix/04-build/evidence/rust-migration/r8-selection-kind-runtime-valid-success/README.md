---
ddx:
  id: umf.evidence.rust-migration.r8-selection-kind-runtime-valid-success
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-kind-runtime-result-continuation
      kind: continues
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Private Selection `kindRuntime` valid-result continuation

This evidence covers one continuation of the private, opt-in Selection host route. When the caller's `kindRuntime.validateDocument` result has a truthy `valid` property, the route retains that original host value through Selection construction and copies it at `/sourceValidation`, matching the TypeScript predecessor's final `copyJson` stage. It skips Rust static validation after the caller has accepted the source, so Rust cannot override that caller decision or re-read registrations.

The positive counterexample sets `source.modules[0].elements[0].scalarType` to numeric `7`, which fails the static Rust schema check, while the caller runtime returns `{valid:true, diagnostics:[], extension:{owner:'caller'}}`. The Node, Bun, and Chromium same-host comparisons report equal serialized Selection output and equal callback trace; the trace contains one `registrations` call followed by `validateDocument`. The returned extension content is retained in `sourceValidation`.

A separate accessor control verifies ordering through the final copy: `.valid` is read first, then the non-enumerable accessor causes `NON_JSON` at `/sourceValidation/valid`. Bun also reruns the existing false-result diagnostics controls. Rust focused host-Selection tests pass 7/7. The focused Bun suite passes 33 tests with 304 assertions. The Node 26.12.1 replay and real Chromium 153.0.8010.12 replay pass; the exact result fields and artifact hashes are in the adjacent receipts.

The receipt set records base commit and content hashes for every consumed source, harness, input, schema, generated constraint, runtime artifact, and fresh Node/WASM artifact. The checkout was dirty during execution due concurrent unrelated work; the receipt makes no clean-checkout claim. Rust was 1.90.0, Bun 1.4.3, wasm-bindgen 0.2.100, and Chromium 153.0.8010.12.

This is a bounded private-route result only. It does not change public exports, V4 defaults, or the default Selection route. It does not establish broad Selection parity, arbitrary Registry behavior, installed-package behavior, or general support for caller-provided validation objects.
