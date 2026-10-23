---
ddx:
  id: umf.evidence.rust-migration.r7-self-model-admission
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# R7 self-model admission slice

This is a source-only implementation slice for the first R7 CLI candidate.
The host continues to read and stage files. Rust receives exact valid UTF-8
source bytes and a parsed manifest value, computes the source SHA-256, calls
`parse_model` only, checks authored identity before manifest provenance, then
validates the predecessor graph. The CLI returns the unchanged catalog shape;
the separately exposed Rust graph function exists for parity tests. No Bun
consumer has been activated.

`frozen/umf.yaml` and `frozen/manifest.json` are byte-for-byte copies of the
inputs captured before Rust edits. `frozen/catalog.canonical.json` and
`frozen/graph.canonical.json` and `frozen/outcomes.json` preserve predecessor
outputs/refusals using the reference module's recursive lexicographic-key
canonicalization (not JCS). The capture
was checked against the model source hash and manifest model SHA. It contains
15 records, 86 fields and 17 edges. The manifest provenance is copied as-is;
`compilerSha256` is not independently verified or attested to the running
compiler.

| Frozen item | Size | SHA-256 |
| --- | ---: | --- |
| Model source | 179,719 bytes | `1e406ee49b0c4c08b8eb996bb1fcb6e96fa8d6f4673f0877aa1800986b2dbbce` |
| Manifest | 38,233 bytes | `97f6398e02a31bfa2eeb308f731099eb262c6374cc06e8a6553d1c0a1ed77b0d` |
| Canonical catalog | — | `d28ad992af59c27142b662580cd701ff4f9f36850155e09d2ae7fd99a0827bca` |
| Canonical graph | — | `f1c5e047d76fb82d9c8b55ba0d667fb62a806757cbc87e909f58ebef554de1d6` |
| Refusal outcomes and added predecessor controls | — | `12dfbc3475e5d4ff8b4de434a4df5007eee03b87779bb5ce92f875bb827cb2f0` |

The API is `umf_metamodel::reference::admit_self_model_catalog`; graph
projection is independently available as `self_model_graph`. The CLI transport
is `umf reference self-model-check --stdin-wire` with a wire request containing
`source` and `manifest`. Its returned value remains catalog-only, matching
`loadSelfModel()`. It reads at most 33,554,433 bytes before refusing requests
larger than 33,554,432 bytes (32 MiB), before wire decoding or source-string
allocation.

The frozen Rust unit and CLI tests compare canonical output against the captured
predecessor. The 2026-10-23 source-tree run passed 16 focused Rust tests, one
CLI test and eight Bun predecessor tests (38 assertions). After the additional
R7 controls, the focused run passed 18 Rust tests; the controls compare exact
captured predecessor TypeError messages for missing/non-array `elements` and
false `members`, and separately pin explicit refusals for dynamic non-string
element IDs and reference targets. The test helper preserves the predecessor's
assignment behavior when inserting an absent member.

An installed CLI replay also passed on Darwin arm64 with Rust/Cargo 1.90.0 and
Bun 1.4.3. `cargo install --locked --offline --path crates/umf-cli --root
/private/tmp/umf-r7-self-model-install --force` installed `umf`; the focused
CLI parity test ran that installed executable via `UMF_REFERENCE_CLI` with the
child `PATH` empty. The installed executable SHA-256 was
`3954fa095d1cf0af7caadcff16af427de616f1bf7da34077a382dec34dd3cfb8`. This is
an installed local CLI qualification, not a published package or Bun-consumer
activation claim. Bun filesystem custody remains unchanged.

The Bun predecessor suite now freezes graph container TypeErrors (missing,
null and non-array `modules`; missing/null/non-array `elements`; false `members`, a
null `members` entry, and object/null-entry `references`),
false-valued record/field names, ECMAScript edge-label coercion for `1e-7`, `{}`
and `['a','b']`, and the rule that top-level and nested arrays do not contribute
shape links, and a reached preowned field name above four million UTF-16 units.
Rust tests cover array behavior, malformed containers,
false labels, ECMAScript numeric formatting, plain-object conversion, nested
array joining, null array members and the inherited ToPrimitive refusal when an
own `toString` member blocks conversion. Conversion and repeated-lookup work
remain metered with `u64` accounting, including products above wasm32's `u32`
range. The operation's actual source/input/output boundaries remain in force;
coercing an already-owned field name does not add another four-million-unit
text ceiling. The null/missing container and member diagnostics match the
captured Bun TypeError text in the focused source-tree tests.
R7 explicitly refuses non-string module/element IDs, record definitions and
declared reference targets; those values are accepted by JavaScript's dynamic
graph code, so this Rust subset does not claim parity for them.

Focused Rust tests also exercise a four-million-plus-unit preowned field label
and late cancellation during graph projection. `bun test
tests/reference/self-model.test.ts` passed all eight Bun consumer controls (38
assertions) after the Rust changes; it remains a review result only and does
not activate the consumer. A final `bun scripts/metamodel/build.ts --check`
attempt was made with a separate `/private/tmp/umf-r7-self-model-metacache`;
it compiled the source-bound native compiler, then refused with
`METAMODEL_STALE_OUTPUT spec/core/schema.json`. This run wrote no outputs. The
generated-input fixed point therefore remains open pending regeneration and
recheck against the integrated source cohort. Compiler provenance copying is
intentionally not an attestation. The CLI wire transport carries a Unicode
string, which round-trips valid UTF-8 source bytes but is not an invalid-UTF-8
ingress interface.

Current changed-source hashes after Sol's source review:

| File | SHA-256 |
| --- | --- |
| `crates/umf-metamodel/src/reference.rs` | `634fa3e51df15c7d0c632eae331577119bc123eaf50a17de73f7a272b2b83b9c` |
| `crates/umf-cli/tests/reference_cli.rs` | `c322c70b056e10a6c348330107b6596f0d9db6729274e9800f1ab0d0ed140b9a` |
| `tests/reference/self-model.test.ts` | `e9fcdbf164438572623b79096db61e21a7b8d9e61fc5f9f45f3b01a8aece0346` |
| `frozen/outcomes.json` | `12dfbc3475e5d4ff8b4de434a4df5007eee03b87779bb5ce92f875bb827cb2f0` |
