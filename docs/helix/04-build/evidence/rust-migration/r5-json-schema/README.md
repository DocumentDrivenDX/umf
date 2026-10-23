# R5 JSON Schema predecessor capture

This is a bounded behavioral baseline for the existing public TypeScript JSON Schema adapter, prepared as the comparison point for the CONTRACT-002 0.1.0 Rust port. It records outcomes from the current public API; it does not assert that those outcomes satisfy the contract or establish Rust equivalence.

The capture invokes the exports from `src/index.ts`: `importJsonSchema`, `inspectJsonSchema`, root/resource/bundle export, `getJsonSchemaNode`, `walkJsonSchema`, `editJsonSchemaNode`, and `parseNativeJson`. Its seven top-level scenario groups cover exact number tokens and opaque native keywords; retrieval URI and resource handling; unknown native dialect and missing `$ref` compile outcomes; ordered inspect diagnostics; malformed JSON, duplicate keys, invalid root, URI errors, and resource collision; schema-position traversal and escaped RFC 6901 access; atomic successful and rejected edits; and representation-unknown export refusal. Returned documents and diagnostics are captured as observed JSON. Errors retain their name, code when present, and message. The harness asserts the successful edit's exported result and the `INVALID_EDIT`, `JSON_SCHEMA_POINTER`, and `JSON_SCHEMA_EXPORT` failure codes. Mutation controls confirm that changes to returned `get`, `walk`, and bundle-source copies do not reach the original document.

## Reproduction

From the repository root, run:

```sh
bun scripts/rust-migration/r5/json-schema-baseline.ts
bun scripts/rust-migration/r5/json-schema-baseline.ts --check
```

The first command intentionally refreshes the capture after a reviewed source change. The second compares byte-for-byte and never updates it. Review a generated diff and decide whether a changed predecessor is intended before replacing the committed baseline. Bun 1.4.3 (macOS arm64) produced this capture. The runtime version is embedded in `baseline.json`; SHA-256 hashes cover the adapter and tree implementation, native and upstream tests, extension schema/package, upstream manifest, CONTRACT-001, CONTRACT-002, ADR-006, the R5 migration plan, and TP-001.

## Governing evidence and limits

The baseline follows CONTRACT-002's payload and operation boundaries, CONTRACT-001 preservation/resource constraints, ADR-006's one-owner migration decision, the latest R5 paragraph in `docs/helix/04-build/rust-migration-plan.md`, and TP-001 at `docs/helix/03-test/test-plan.md`. TP-001's JSON Schema Oracle requires pinned dialect, validator/configuration, vocabularies and resources; upstream expected outcomes before and after round trips; preservation and edit checks; and explicit exclusions. Its shared Rust migration verification also says frozen expectations and old/new parity complement independent native oracles rather than replace them. CONTRACT-002 names Ajv 8.20.0 Draft 2020-12 with format assertions disabled, and its independent upstream evidence profile is 46 required root files, 384 cases, and 1,301 vectors at the recorded upstream revision. Existing `tests/json-schema/native.test.ts` and `tests/json-schema/upstream.test.ts` provide implementation tests.

This harness does not rerun the independent native oracle corpus, browser Chromium path, full JSON Schema test suite, or external reference resolvers. It samples public adapter operations and focused precedence cases, so it cannot qualify semantic equivalence, complete diagnostic behavior, all resource graph collisions, all limits, all Draft 2020-12 applicators, WASM/browser delivery, or binding parity. The source's existing tests and contract evidence remain separate and must be replayed for the Rust port. In particular, snapshot self-comparison only detects drift; it is not an independent oracle. Keep Ajv/upstream/browser results and their source revision distinct from this baseline.

The capture deliberately leaves implementation and fixtures untouched. It provides a reviewable observation set for the Rust adapter agent; it is not a completed R5 qualification or a default-cutover decision.

The subsequent source-bound [Draft 2020-12 v12 receipt](draft2020-completion-v12-2026-10-23.md)
records the Rust core's accepted pinned-corpus run and its explicit remaining
delivery limits. This predecessor baseline remains unchanged.

Independent Sol rereview reproduced all five awaited edit/export outcomes, nine
admission cases, copy-isolation controls, twelve source hashes and byte-for-byte
`--check` with no remaining P1/P2 in this bounded predecessor capture. Rust
adapter equivalence and native/browser qualification remain separate gates.
