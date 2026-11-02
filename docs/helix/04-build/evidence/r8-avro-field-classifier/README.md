---
ddx:
  id: umf.evidence.rust-migration.r8-avro-field-classifier
  type: evidence
  activity: build
  status: candidate
  authoring:
    home: repo
  links:
    - id: CONTRACT-007
      kind: verifies
    - id: CONTRACT-040
      kind: verifies
    - id: umf.evidence.rust-migration.r8-core-ideals-next-wave
      kind: implements
    - id: umf.evidence.rust-migration.r8-avro-record-type
      kind: informs
---

# R8 bounded Avro Field classifier

This Rust module ports the `classifyAvroField` membership assertion used by
the Avro Record Type composition. It classifies a materialized `avro.fields`
element as core `kind: field` only when the retained Avro metadata identifies
it as a declared member of an Avro 1.12.0 record or error. The exported function
is `avro_field_classifier::classify_field(source, request, context)`.

The operation copies and validates the request against the exact
`avro-field-classification.schema.json`, validates the current UMF document and
Avro package, checks the retained root and ordered dependency archive before
resolving the requested field, and validates the final report against the same
classification schema. It preserves the tagged native field fragment and
source document. Authored kind receipts are recomputed through
`core_kind::verify_core_kind_declaration`; a matching authored Field is
accepted, while conflicting, stale, mismatched-identity, invalid or missing
provenance for an existing kind blocks classification with the predecessor's
residual and diagnostic shape. `strict` and `report` are retained in the
request; both return the same classification or blocked receipt shape.

The binding claim is limited to declared record/error field membership with
caller-supplied named dependencies. The existing `avro_fields` kernel derives
the element identity and exact native path/fragment. This operation does not
claim full Avro validity, scalar/logical equivalence, presence or value-domain
equivalence, host bindings, default adapter activation, or full TypeScript
classifier parity. Wider frozen-packet replay remains open.

## Scoped classified-bundle recovery follow-up

`avro_field_recovery::recover_field_bundle(receipt, current, context)` is an
opt-in recovery operation layered on the classifier. It validates the complete
classification receipt schema and classified status, recomputes the receipt
from its retained source and request, compares the whole receipt using sorted
object keys and ordered arrays, then compares the supplied current document to
the recomputed target. A changed receipt returns `AVRO_FIELD_RECEIPT`; a stale
current document returns `AVRO_FIELD_STALE`; blocked receipts cannot recover.
Successful recovery returns only the original request `nativeSource` and
ordered dependency `id`/`schema` texts. Those UTF-16 strings are copied exactly
and are not rendered from parsed trees.

Structural equality compares admitted numeric values as Rust `f64`, matching
the supported JSON number value semantics. This is not a token-spelling check;
the original native source and dependency text is separately returned without
normalization. This recovery profile makes no host, default-adapter, full Avro
validity, or cross-language parity claim.

Focused verification on Rust 1.90.0 / Darwin arm64:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-avro-recovery-target \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
test -p umf-core avro_field_recovery::tests --offline
```

Result: 4 passed. The cases cover exact root and named-dependency text recovery,
tampered receipt rejection, stale current-model rejection, and blocked-receipt
refusal.

Focused verification on Rust 1.90.0 / Darwin arm64:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-avro-field-target \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
test -p umf-core --test r5_avro_field_classifier
```

Result: 3 passed. The tests cover a root field with a named dependency,
preservation of the tagged native fragment, an existing unproven kind,
root/dependency archive mismatch, and source retention. The module unit test
`avro_field_classifier::tests::authored_receipts_are_checked_in_strict_and_report_modes`
passed separately, covering a verified authored Field, a conflicting authored
Record, a stale receipt and a receipt for another field identity across strict
and report modes. This is focused implementation evidence, not a replay of the
100-case Avro field derivation packet.

The relevant source and governing inputs at this evidence cut are fingerprinted
below (SHA-256, repository-relative paths):

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/avro_field_classifier.rs` | `64c484b0a4b3fac7d4dc0eaa0e594226c15febd40449622d0f8585e2cdd13348` |
| `crates/umf-core/src/avro_field_recovery.rs` | `88ab1206644ffc08db80cc19a7047334c47dbbfe2f722320607658449e7172de` |
| `crates/umf-core/src/avro_fields.rs` | `b78ace9d77f74ae1f0bbdc9e8ce852bf3fad20079aea02f200808ea89bc6985c` |
| `crates/umf-core/tests/r5_avro_field_classifier.rs` | `e065da99bfd690c2e2d5427011464200c254dadf55c696eff406122c10691ba5` |
| `spec/core/avro-field-classification.schema.json` | `bec1c153cd99bd7cde4ecafbec4357b51beedca1c315ff92b0148b09a9401fbc` |
| `spec/core/kind-operation-v6.schema.json` | `e1de0aba1c3db6a09e85332a10441a0eec7a2dca0a4e4249fab67fcc491783b8` |
| `docs/helix/02-design/contracts/CONTRACT-007-avro.md` | `7db5553878fda5fd8552ee9c0e2bc5d56f80e3a1c35b0bfeaefde4618f3fd1d1` |
| `docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md` | `58b5f07693618b91f73da98fba04ba14b222285e84b33b8639eb057bc7e3abd0` |

Compile-time embedded resources also include the current core schema, semantic
type reference, extension package schema, generated core constraints, generated
domain policy, and Avro package manifest. No TypeScript predecessor or docs
evidence fixture is embedded by this module.
