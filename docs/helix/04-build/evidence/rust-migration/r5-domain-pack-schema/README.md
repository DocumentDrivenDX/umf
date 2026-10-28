---
ddx:
  id: R5-DOMAIN-PACK-SCHEMA
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-052
      kind: informed_by
---

# R5 domain-pack schema resource candidate

This bounded opt-in candidate embeds the checked-in canonical `umf.domain-pack`
1.0.0 JSON Schema resource in the Rust core. The versioned Rust function returns
the immutable JSON text for `1.0.0` and refuses unknown versions. CPython parses
and returns a fresh Python object; Node and WASM expose the same resource text
for a host wrapper to parse into a fresh JavaScript object. This resource carries
the Draft 2020-12 schema only; it does not fetch references, execute pack
generators, or change the TypeScript default route. The TypeScript generator
continues to own regeneration of `spec/extensions/domain-pack/schema.json` and
its package.

The candidate source is in `crates/umf-core/src/domain_pack_schema.rs`, with
Node, WASM and Python host entry points in their existing binding crates.
The canonical schema bytes have SHA-256
`e34054015eae699987d7fd0640bdbc17906b129fa46b2c5770753ebf0723931e`.
The Rust core's two focused unit cases pass, including unknown-version refusal;
`cargo check --offline` passes for all three binding crates. The Bun host-wrapper
test passes with an injected provider, and `bun scripts/domain-pack-schema.ts
--check` confirms the checked-in TypeScript-generated schema is current.

Direct local binding replays are captured in [`node.json`](node.json),
[`python311.json`](python311.json), [`python313.json`](python313.json), and
[`browser.json`](browser.json). The native Node 26.12.1 N-API call, the same
`cp311-abi3` extension loaded by CPython 3.11.17 and 3.13.16, and real Chromium
153.0.8010.12 WASM each return the exact canonical JSON structure, produce
independent mutable parsed objects, and refuse version 2.0.0. Chromium loads
the generated WASM glue and observes no Node globals. The checked probes are
`scripts/rust-migration/r8/domain-pack-schema-{node,python,browser}-probe.*`;
the receipts pin the local native/WASM artifact hashes. The Node wrapper
explicitly converts a returned N-API `Error` object into a thrown error before
parsing. [`SHA256SUMS`](SHA256SUMS) pins the reviewed source, probe, and
receipt bytes and passes `shasum -a 256 -c`.

The metamodel outputs were regenerated after the Rust edit and the source-bound
`bun scripts/metamodel/build.ts --check` passes. These local probes cover the
opt-in resource only. They do not establish an installed SDK or wheel, Linux
parity, default route, Rust ownership of the schema generator, pure Rust CLI
exposure, full browser library selection, or release qualification. No
default-route retirement follows from this candidate.
