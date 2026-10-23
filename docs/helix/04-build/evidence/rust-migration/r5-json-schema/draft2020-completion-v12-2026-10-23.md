---
ddx:
  id: R5-JSON-SCHEMA-DRAFT2020-V12
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
---

# R5 Draft 2020-12 pinned-corpus acceptance v12 — 2026-10-23

This additive receipt records the final bounded Draft 2020-12 Rust evaluator
capture. The profile is the 46 required root files, 384 cases and 1,301
vectors at upstream revision
`ab079cc2bace029fdbb483be28a6ade526bcfbc2`, with Ajv 8.20.0,
`strict=false`, `validateFormats=false`, `ownProperties=true`,
`addUsedSchema=false`, explicitly preloaded resources and no implicit network.
The 91-file executable source closure was byte-identical before and after the
capture. Its `schema.rs` SHA-256 was
`a6957bbee794086753b751e76b0ccd62c688c1ebf622e71c2fe5a4f9e0a48d17`;
the simultaneously frozen `protobuf_source.rs` SHA-256 was
`f7751dc46831ceedd21ce27376fc6267c2e0653796bf57510437429e8ae4e32e`.
The comparison report records all 91 path hashes.

The [raw Rust capture](rust-raw-v12-2026-10-23.json) SHA-256 is
`e0bbed432b5f768beab549d141c95653b44102428c594fc124b409d316a36190`.
The [comparison report](comparison-v12-2026-10-23.json) SHA-256 is
`191c55a6bb888dbd3714255fd493556369290f8a3da40cfd8b6df8fede546983`.
Rust executed all 1,301 vectors with zero compile failures, runtime errors,
missing cases, or upstream-expected boolean disagreements. The reviewed
acceptance gate returned `accepted: true`, `failures: []`, with 35 explicit
exclusions. Ajv's baseline has 30 disagreements with upstream expectations;
these are retained as attributed oracle differences, not Rust waivers.

Reproduce the gate against the committed reports:

```sh
bun scripts/rust-migration/r5/json-schema/acceptance.ts \
  docs/helix/04-build/evidence/rust-migration/r5-json-schema/comparison-v12-2026-10-23.json \
  docs/helix/04-build/evidence/rust-migration/r5-json-schema/rust-raw-v12-2026-10-23.json
```

Pinned Rust 1.90.0 offline `umf-core --lib` passed 207/207 tests. Independent
Sol review of the final `schema.rs` source hash found no P1/P2 in the metered
lookup paths: custom-vocabulary tests passed 12/12, prior fragment refusals
matched, and work charges grew with long vocabulary, retrieval-URI and
object-member inputs. This qualifies this exact Rust core dialect/profile and
corpus. It does not qualify other dialects, external network resolution,
complete adapter operations, native package bindings, browser delivery, or
the default Node/Bun cutover.
