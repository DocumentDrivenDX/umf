---
ddx:
  id: umf.evidence.rust-migration.r5-edit-extension
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# R5 Rust extension edit transaction

This bounded native core slice implements `edit_extension` in
`crates/umf-core/src/edit_extension.rs`. It admits the complete source through
the supplied `Engine`, immutable `Registry`, capability set and one invocation
`Context` before target lookup. It then copies the document, identifies the
module, element and extension key using exact UTF-16 values, copies the payload
before invoking the trusted updater once, copies the returned payload into the
candidate and validates the complete candidate with the same engine and
registry. The source tree and registry are not mutated.

The Rust API returns `UNSAFE_EDIT` for invalid or incomplete source validation,
`MISSING_ELEMENT` when a fully understood source lacks the requested extension,
and `INVALID_EDIT` when candidate validation fails. Control-origin errors
propagate from the shared context and remain distinguishable from semantic
refusals. `HardIsolated` is refused before semantic work. The bounded profile
uses an immutable registry, so predecessor behavior involving mutation of a
live registry or callback reentrancy is outside this parity claim.

## Current checks

`scripts/rust-migration/r5/edit-extension/freeze.ts` writes the complete
predecessor fixture in `frozen.json`. The frozen success document includes
opaque nested data and a second module with a colliding element ID; the fixture
also records unsafe-source, missing-instance and invalid-candidate errors,
source and candidate callback traces, and a lone-surrogate module/element case.
The Rust tests compare the complete successful and error results, updater count,
callback order, UTF-16 identities, original-source isolation and control-failure
origin.

The frozen predecessor fixture SHA-256 is
`b00d222b564aec006338bbc4bb6a1846d1659a72117741c4167f52bb4595ec45`.
The current implementation and test source hashes are
`8d28823abe04ef341207f0ee62fe6a5db9ab5a4c8f66777a643f34de5af7481c` and
`53f757911f5daecac478a2b27844d129cef5553860998d9b06986d2638713d30`,
respectively. Sol's reopened source review found that diagnostic text copies
were made before the invocation work meter was charged. The implementation now
precharges each diagnostic's UTF-16 fields and projection allowance before
cloning any text, and charges the diagnostic count before reserving the result
vector. Low-work regressions deny the charge for a 65,537-unit message and for
50,000 diagnostic slots before projection/reservation. Final independent Sol
rereview of implementation SHA-256
`8d28823abe04ef341207f0ee62fe6a5db9ab5a4c8f66777a643f34de5af7481c`
reproduced the full core suite, actual-output Ajv, callback traces, frozen
comparison and TypeScript typecheck with no remaining P1/P2 in this native
immutable-registry slice.

`verify-ajv.ts` obtains a complete document from the actual Rust test process,
validates it against the production core schema and frozen extension schema,
compares it to the TypeScript envelope, then changes the extension label to a
number and confirms Ajv rejects that negative control. This validates the
recorded schema subset; it does not establish broad Draft 2020-12 compatibility.

Run on the captured Darwin arm64 Rust 1.90.0 toolchain:

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-edit-target \
  cargo test -p umf-core --test r5_edit_extension

PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-edit-review-fixed \
  cargo test -p umf-core --lib edit_extension::tests::long_validation_diagnostic_precharges_before_projection -- --nocapture

PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH \
  rustfmt --check crates/umf-core/src/edit_extension.rs \
  crates/umf-core/tests/r5_edit_extension.rs
```

The focused Rust test target passes 4 tests, the new long-diagnostic unit
regression passes, formatting passes, and the full `cargo test -p umf-core`
suite passes for the repaired source cohort (114 unit tests plus all integration
tests). The Ajv
replay reports the Rust output valid under both schemas, equal to the frozen
TypeScript document, and rejects the invalid-payload negative control. Node/Bun
binding parity, real-browser evidence and source-cohort closure remain required
before broadening this checkpoint. `bun run typecheck`
passes for the repository TypeScript/tooling cohort after fixing the verifier's
negative-control type annotation.

## Live TypeScript predecessor traces

`live-trace.ts` exercises the current `src/model/document.ts` implementation and
writes the captured output to `live-trace.json`. This extends the predecessor
freeze beyond immutable-registry cases. It records ordered semantic/updater
callbacks and the final source/result values for: registry mutation during the
first validation (including a newly registered v2 package selected on the
candidate validation); original input mutation during a semantic callback before
the source copy; nested `editExtension` from the updater; and exact exception
identity for updater throws versus semantic-validator throws. It also records
that semantic payload and document inputs are detached copies and that nested,
outer, and source payloads remain independent.

Reproduce from the repository root with:

```sh
bun scripts/rust-migration/r5/edit-extension/live-trace.ts
```

Captured on Bun 1.4.3, Darwin arm64. Harness source SHA-256:
`24f3282ba253272b7323ef302163caff7df026d38e22c53fac1556104f109e62`.
Frozen trace SHA-256:
`0a688a9b973fafcda02d79dad52e71d690ecd2c319f343fa21c0952d96ea49c3`.
The reproducible `freeze-closure.ts` script writes `executed-closure.json`, hashing the recursive local import closure for the harness and predecessor entrypoints, generated model and validators, schema and generated policy resources, package metadata and lockfile. Reproduce it after the trace with `bun scripts/rust-migration/r5/edit-extension/freeze-closure.ts`. This execution manifest is source-bound and identifies the captured Bun/runtime platform; it does not hash external Bun/Ajv package contents beyond the lockfile. These are executable predecessor observations, not an independent native oracle
or a Rust parity result. The traces establish synchronous TypeScript behavior for
the exercised synthetic packages and one module/element. A registration made during the initial validation makes a later target callback observable in that same pass, but the prior unknown-registration diagnostic remains and forces `UNSAFE_EDIT` before updater invocation. Validator exceptions during initial validation are caught into the validation refusal; candidate-pass semantic exception mapping is not exercised. These traces do not qualify
Rust host integration, browser/Node/Python wrappers, cancellation, arbitrary
callback side effects, or broader source cohorts.
