# Python Parquet source-archive closure correction

The real d62 local producer reached native wheel compilation from its source
archive and failed at `include_str!` for `spec/extensions/parquet/idl.json`.
The corrected Hatch source list and independent verifier membership both carry
that exact resource. Executable verifier/helper pins, including the workflow
finalizer checked locally, match the revised helper. Historical evidence stays
unchanged; no GitHub Actions job was dispatched or awaited.

The existing literal-include audit still scans all Rust spec references. Four
small test-only spec inputs exposed by that audit are also included explicitly:
the scoped SEC submissions/company-facts JSON inputs and the two version 1.0.0
loader-companion schemas (32,960 bytes combined). No source resource bytes were
changed, and no conditional-code filter narrows the audit.

[Independent Sol review](sol-review.md) approves the composed correction.
[Reviewed inputs](reviewed-inputs.json) records the exact files.
[Fresh archive verification](sdist-verification.json) matches all 1,165 files
and the Parquet IDL bytes against the reviewed private source. The first broad
test run passed 133 tests and exposed the stale finalizer pin; after its repair,
the [seven finalizer controls](finalizer-tests.log) pass. The complete integrated
packaging suites pass [all 134 tests](integrated-tests.log). The verified archive
is being rebuilt into a native wheel offline. These checks do not qualify the full installed Python
matrix or any release.
