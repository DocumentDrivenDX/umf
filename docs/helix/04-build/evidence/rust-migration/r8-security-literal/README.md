---
ddx:
  id: umf.evidence.rust-migration.r8-security-literal
  type: evidence
  activity: build
  status: draft
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
---

# Security disclosure literal-admission foundation

This slice adds `Engine::check_schema_literal_public`, a direct operation-error
projection over the existing Rust `validate_schema_literal_public` literal
kernel. It matches TypeScript `checkSchemaLiteral` for an already admitted
document, selected Field and JSON literal using the repository's trusted core
schema, constraints and generated domain-policy resources. The focused packet
freezes 11 current Bun cases: integer signed-width endpoints and malformed
tokens, required versus absent-allowed null, unknown wrapper/facet precedence,
decimal exact-scale versus rounding, supplementary Unicode scalar length, and
unpaired-surrogate refusal. Rust tests compare acceptance or exact code, path and
message for every case.

The Rust method returns the first diagnostic as an `EngineError`, matching the
TypeScript throwing helper. A separate test verifies that a caller work meter can
refuse literal evaluation before a result is returned. That cooperative meter is
a Rust resource control, not a claim that direct TypeScript `checkSchemaLiteral`
has the same callback or budget surface.

This establishes only literal admission after source/field/value selection. It
does not resolve security policy or ontology references, prove the Field belongs
to a pinned document, validate either disclosure envelope, or establish native
authority. JSON/YAML codec parity, duplicate-key/error-order behavior, raw-host
accessor/proxy handling, host bindings and default routes remain unqualified.
Security disclosure codec parity must wait for the distinct legacy policy /
ontology closure and V2 protection-source/domain/parameter closure described in
the R8 security audit.

`bun scripts/rust-migration/r5/security-literal-predecessor.ts --check`
recomputes the frozen predecessor in memory and compares byte-for-byte; running
without `--check` explicitly refreshes it. Focused Rust verification:

```sh
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
 CARGO_TARGET_DIR=/private/tmp/umf-security-literal-target \
 /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo test \
 -p umf-core --test r5_security_literal
```

## Tagged opt-in wire primitive

The isolated module
[`security_disclosure_literal_binding.rs`](../../../../../../crates/umf-core-wire/src/security_disclosure_literal_binding.rs)
adds the `umf.security-disclosure-literal/1` tagged-wire operation
`checkSchemaLiteral`. It requires explicit core schema/reference/package,
constraint and domain-policy resources, plus a caller-selected source document,
Field and literal. It calls the same Rust core check and replays every one of
the 11 frozen TypeScript cases through tagged request admission and result
encoding, comparing exact success or code/path/message units. Additional tests
refuse an incorrect profile and unknown request members, and verify caller
control can stop work before a result is encoded.

This opt-in primitive is only literal admission after the caller has selected
the document and Field. It is not equivalent to any of the six public legacy
or V2 disclosure validate/encode/decode exports: those remain validation-
coupled to policy, catalog, ontology/domain, parameter and transport closure.
It is not connected to Node, WASM, package roots or default routes, and tagged
wire does not represent raw JavaScript accessors/proxies.
