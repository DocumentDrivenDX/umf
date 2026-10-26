---
ddx:
  id: umf.evidence.rust-migration.r8-truss-component-profile
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-069
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: umf.evidence.rust-migration.r6-related-key-payload
      kind: informed_by
---

# R8 Truss related-Key component profile predicate

This opt-in operation ports only the closed JSON-shaped predicate previously
implemented by `_truss_component_type` in
`python/umf_access/src/umf_access/related_keys.py`. The accepted carriers are
string and boolean with empty facets; integer with empty facets or exactly
`integerWidth: {bits: 64, signed: true}`; and decimal with exactly one of
`(precision, scale) = (18, 4), (18, 2), (12, 2)`. In all cases the exact
component object has `family`, `facets`, and literal `nullable: false` fields.
Temporal, binary, extra, and mistyped facets refuse.

`validate_decoder` remains the default Python route. The explicit
`validate_decoder_rust` path uses this operation only for Truss component type
checks. Generated Key class identity, source pins, ordering, descriptor and
engine metadata validation remain Python-owned. This preserves CONTRACT-068's
exact generated DTO identity and CONTRACT-069/071's host ownership boundaries.
The R6 parser evidence remains authoritative for its separate `json.loads`
subset; it did not move this metadata rule.

The bridge accepts only `json.dumps` output from an exact built-in dict whose
tree consists of exact JSON-compatible built-ins. It refuses subclasses,
repeated/cyclic container references, non-finite floats, and unsupported values; therefore serde_json's
duplicate-object-key behavior is unreachable through this facade. The PyO3
operation itself consumes JSON text and is not claimed to match arbitrary raw
JSON duplicate-key semantics. The Rust selection does not run Python as a
silent fallback. Non-exact Python equality, dict-subclass behavior, generated
class identity and metadata admission remain outside the Rust subset.

Focused verification on CPython 3.14.8 ran
`python/umf_access/tests/test_rust_truss_component_profile.py`: fourteen
accepted/refused component examples matched `_truss_component_type`, and
subclass, non-string carrier, shared-container, and cyclic inputs were refused
by the opt-in facade. The focused Rust core unit test
`truss_component_type_matches_the_closed_non_temporal_profile` passed. The
PyO3 package compiled with Rust 1.90.0. `validate_decoder_rust` parity and
refusal controls are also added to `test_truss_related_metadata.py`; that
generated-Key integration module was not run here because this checkout has no
generated `commerce` fixture on the import path.
