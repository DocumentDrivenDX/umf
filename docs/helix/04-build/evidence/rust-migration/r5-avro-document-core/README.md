# R5 opt-in Avro document preservation core

This record qualifies a first Rust `umf-core` preservation slice for the
Avro 1.12.0 schema-document operations governed by
[CONTRACT-007](../../../../02-design/contracts/CONTRACT-007-avro.md). The
independent [TypeScript predecessor packet](../r5-avro-full-predecessor/README.md)
is the comparison baseline. This is not full Avro qualification or default
binding cutover.

The opt-in `avro_document` module imports schema JSON plus caller-ordered
dependency inputs into a current core 0.10.0 UMF document. It retains the exact
tagged JSON tree, derives the existing `avro.fields` materialized view, validates
the complete core envelope and registered Avro payload shape, and charges work
through the caller's `Context`. Root export refuses documents with dependencies;
bundle export returns the root, dependency artifacts in source order, and a
detached complete UMF source copy. Copied node lookup supports an optional
dependency ID and strict RFC 6901 pointers.

Native custom metadata, member order, and exact JSON numeric tokens are retained.
Unknown tagged-representation fields remain available through copied node reads,
but block native root and bundle export. Export checks that a materialized
`avro.fields` view still agrees with the native source. Unrelated declared UMF
vocabulary/extension content remains in the returned bundle source. Cancellation,
deadline, ordinary text/work/tree limits, and control-failure provenance are
provided by the caller's existing `Context`.

The focused Rust integration target passed **8/8 tests**, and the dedicated
newline-boundary library test passed **1/1**, with Rust 1.90.0:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-avro-document-target \
cargo test -p umf-core --test r5_avro_document
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-avro-document-target \
cargo test -p umf-core --lib root_and_dependency_lines_respect_the_newline_text_ceiling
```

The tests compare tagged root and dependency trees with the frozen predecessor
observations and cover exact root JSON, ordered dependencies, custom native
metadata, copied bundle source, escaped/missing/malformed pointers, missing and
duplicate dependency IDs, exact int64 token retention, unknown-representation
refusal, stale materialized fields, invalid core envelopes, and resource,
cancellation, and deadline controls. The run produced only existing unused-code
warnings in Avro field metadata and Protobuf descriptor sources.

The follow-up regression checks enforce the final serialized text ceiling
including the appended newline for root/dependency rendering, and charge work
for each dependency-ID equality comparison in both import and document payload
extraction. Repeated long IDs make the comparison-cost assertions observable.
The newline test covers the exact-fit and one-unit-short ceilings.

The checked source fingerprints for this slice are:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/avro_document.rs` | `6db7c25df4770576348c24dfbe8a303e3a1c4f08896dfd236a08423aff697f09` |
| `crates/umf-core/src/lib.rs` | `c3a1122df0d32d6702c5968b1415334f22e299bb832a2876976162b3fe389ecb` |
| `crates/umf-core/tests/r5_avro_document.rs` | `ea8a58c4b12ec8e6cfd130b9ce9687a167aaa0a3f7587d7bfa92a9806aee1c51` |

These selected fingerprints do not describe an exhaustive transitive build
closure. The focused Rust run establishes this test target only; the broader
`umf-core` suite, source-bound native capture, independent review, binding
integration, and browser execution have not been performed for this slice.

Semantic Avro inspection/validation, candidate and conservative edits, datum
codecs, Avro protocol/IDL/object-container formats, source diagnostics in bundle
results, host bindings, and default-adapter cutover remain unimplemented here.
The frozen predecessor's `avsc` 5.7.9 and Apache Avro observations do not become
Rust-native evidence by this preservation test. In particular, this slice makes
no claim of full Avro 1.12.0 semantic validity or native-engine equivalence.
