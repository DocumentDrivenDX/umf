---
ddx:
  id: umf.evidence.rust-migration.r9-avro-cardinality-classification
  type: evidence
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
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-avro-record-type
      kind: references
---

# R9 Avro Cardinality classification candidate

**Source base:** `4dc0d1daeaecd86ba9286e6cf93d7d5d041cee2d` in this private clone. **Profile:** core 0.10.0, Avro structural 1.12.0, `umf.avro.cardinality` 1.0.0, opt-in tagged binding `umf.avro-cardinality-binding/1.0.0`.

The production `umf-core` module owns `classifyAvroCardinality`, `verifyAvroCardinalityClassification`, and `recoverAvroCardinalityBundle`. It uses the retained `NativeJsonTree` and `avro_document` archive, the `avro_fields` metadata and scalar-family kernel, exact core schemas and extension manifest, and one Rust implementation across the tagged CLI, Node/Bun, Python and browser WASM routes. The TypeScript exports remain explicit reference operations. This slice does not change default selection or publish an installed release.

`freeze.ts` captures 80 complete, ordered TypeScript envelopes from the 20 authored Avro Cardinality cases across both profiles and modes. `compare-parallel.ts` invoked the actual Rust CLI with an empty `PATH`; **80/80 classified or blocked envelopes matched**, including native fragments, logical identity graph, residuals, diagnostics, target documents and exact unknown numeric lexemes. `freeze-extra.ts` captures malformed requests, source/archive/version conflicts, identity conflicts, dependency-qualified enum items, forged and stale receipts, a reformat-tolerant retained dependency, a raw UTF-16 surrogate in unknown native metadata, aliases, an exact unsafe integer lexeme, duplicate union branches, an unresolved named reference and invalid fixed size. `compare-extra.ts` invoked the same CLI; **22/22 wire-representable controls matched**. The TypeScript-only `undefined` input produced `NON_JSON` before the operation and is outside the tagged `Value` domain.

Freshly built native Node and Bun addons, and a Python abi3 extension invoked through `rust_avro_cardinality.py`, each classified, verified and recovered the frozen `empty-array/present-non-null-schema/strict` receipt. A release WASM build passed `wasm-bindgen 0.2.100`; real Chromium 153.0.8010.12 classified, verified and recovered that same receipt. The first sandboxed browser run could not bind a local loopback port (`EADDRINUSE`); the authorized local retry passed. `python/tests/test_python_sdist.py` passed 14 tests, including the expanded exact resource list and updated helper pin. These are current-source local routes, not installed wheel/npm or release qualification.

The classifier reports a residual for unresolved profiles, null-only or mixed container branches, and unresolved structural types. Strict mode blocks residuals; report mode retains them. It copies source and request, refuses incompatible target identities and vocabulary versions, re-exports the target to check native archive conservation, and verifies receipts by recomputation before recovery. Recovery returns the caller's retained source text and ordered dependency strings; whitespace in an equivalent dependency may change without falsely claiming receipt authentication.

## Reproduce

```sh
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/freeze.ts
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/freeze-extra.ts
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/compare-parallel.ts
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/compare-extra.ts
PYTHONDONTWRITEBYTECODE=1 /private/tmp/umf-r8-python-env/bin/python -m pytest -q python/tests/test_python_sdist.py
```

The compare scripts expect the locally built CLI at `/private/tmp/umf-avro-cardinality-target/debug/umf`. The host tests use locally built addon/extension artifacts and generated release WASM glue; the recorded `receipt.json` identifies their outcomes and source hashes. The browser test needs a loopback bind. Local Rust 1.90.0 and wasm-bindgen 0.2.100 were used.

## Limits

This evidence covers schema-level present, non-null shape and its retained archive. It does not establish Apache Avro compiler equivalence, datum codec behavior, authored Cardinality projection, every possible Avro declaration or alias combination, full resource/cancellation/deadline matrices, installed artifacts, default-route retirement, or release readiness. CONTRACT-001–011 do not add an operation-specific Cardinality rule; CONTRACT-040 and the current TypeScript API define this bounded classification behavior. Wider native and consumer gates remain separately open.
